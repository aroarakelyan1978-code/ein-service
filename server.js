const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const {
  listApplications,
  getApplicationById,
  getApplicationByTrackingCode,
  saveApplication,
  updateApplication,
  getDraft,
  saveDraft,
  deleteDraft,
} = require('./lib/storage');
const { sendApplicationConfirmation, sendContactNotification } = require('./lib/email');
const {
  reasonOptions,
  documentOptions,
  getReasonByCode,
  buildW7Summary,
  createW7PdfBuffer,
} = require('./lib/w7');

const app = express();
const port = Number(process.env.PORT || 3000);
const site = {
  baseUrl: process.env.BASE_URL || 'https://etaxids.com',
  businessName: process.env.BUSINESS_NAME || 'ETAX IDS ITIN Assistance Service',
  brandName: process.env.BRAND_NAME || 'ETAX IDS',
  businessAddress: process.env.BUSINESS_ADDRESS || 'Business address available upon request',
  privacyEffectiveDate: process.env.PRIVACY_EFFECTIVE_DATE || 'March 30, 2026',
  termsEffectiveDate: process.env.TERMS_EFFECTIVE_DATE || 'March 30, 2026',
  servicesPricingEffectiveDate: process.env.SERVICES_PRICING_EFFECTIVE_DATE || 'March 30, 2026',
  governingState: process.env.GOVERNING_STATE || 'California',
  serviceFeeDisplay: process.env.SERVICE_FEE_DISPLAY || '$149',
  supportEmail: process.env.SUPPORT_EMAIL || 'contact@etaxids.com',
  supportPhone: process.env.SUPPORT_PHONE || '(800) 555-0148',
  supportHours: process.env.SUPPORT_HOURS || 'Monday-Friday, 9 AM-5 PM PST',
  disclosure: 'We are not the IRS. We are a private company that provides assistance with ITIN applications.',
  disclosureExtended:
    'We are not the IRS. We are a private company that provides assistance with ITIN applications. Service fees apply for preparation, review, and guided support. You may apply directly with the IRS at no cost.',
};
const adminConfig = {
  email: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
  password: process.env.ADMIN_PASSWORD || 'ITIN123!',
};
const applicationStatuses = [
  'Submitted',
  'Under Review',
  'Awaiting Client Documents',
  'Prepared for Submission',
  'Closed',
];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace-this-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.locals.site = site;
  res.locals.currentPath = req.path;
  res.locals.applicationStatuses = applicationStatuses;
  res.locals.year = new Date().getFullYear();
  next();
});

app.get('/healthz', (req, res) => {
  res.type('application/json');
  res.send({ ok: true });
});

const draftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === 'yes' || value === '1';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function buildTrackingCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let code = '';
  do {
    code = `ITIN-${stamp}-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (getApplicationByTrackingCode(code));
  return code;
}

function buildTrackUrl(application) {
  const params = new URLSearchParams({
    code: application.trackingCode,
    email: application.contact.email,
  });
  return `${site.baseUrl}/track?${params.toString()}`;
}

function buildHomeStructuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: site.businessName,
      url: site.baseUrl,
      email: site.supportEmail,
      telephone: site.supportPhone,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'ITIN Application Assistance',
      provider: {
        '@type': 'Organization',
        name: site.businessName,
      },
      description:
        'Private ITIN application preparation and guided support service. We are not the IRS and are not affiliated with the IRS.',
      areaServed: 'United States',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: site.serviceFeeDisplay.replace(/[^0-9.]/g, '') || undefined,
      },
    },
  ];
}

function makePage(view, overrides = {}) {
  return {
    view,
    site,
    reasonOptions,
    documentOptions,
    initialDraft: null,
    draftMeta: null,
    structuredData: null,
    canonical: '',
    metaDescription: '',
    trackingResult: null,
    trackingError: '',
    trackingCodeQuery: '',
    trackingEmailQuery: '',
    loginError: '',
    contactSubmitted: false,
    contactError: '',
    contactForm: {},
    ...overrides,
  };
}

function sanitizeApplicationPayload(raw = {}) {
  const selectedDocuments = Array.isArray(raw.supportingDocuments?.selected)
    ? raw.supportingDocuments.selected.map(normalizeText).filter(Boolean)
    : [];

  return {
    draftId: normalizeText(raw.draftId),
    applicationType: raw.applicationType === 'renewal' ? 'renewal' : 'new',
    personal: {
      firstName: normalizeText(raw.personal?.firstName),
      middleName: normalizeText(raw.personal?.middleName),
      lastName: normalizeText(raw.personal?.lastName),
      birthFirstName: normalizeText(raw.personal?.birthFirstName),
      birthMiddleName: normalizeText(raw.personal?.birthMiddleName),
      birthLastName: normalizeText(raw.personal?.birthLastName),
      dateOfBirth: normalizeText(raw.personal?.dateOfBirth),
      gender: normalizeText(raw.personal?.gender),
      countryOfBirth: normalizeText(raw.personal?.countryOfBirth),
      cityProvinceOfBirth: normalizeText(raw.personal?.cityProvinceOfBirth),
      countryOfCitizenship: normalizeText(raw.personal?.countryOfCitizenship),
    },
    contact: {
      email: normalizeEmail(raw.contact?.email),
      phone: normalizeText(raw.contact?.phone),
    },
    foreignStatus: {
      foreignTaxId: normalizeText(raw.foreignStatus?.foreignTaxId),
      visaType: normalizeText(raw.foreignStatus?.visaType),
      visaNumber: normalizeText(raw.foreignStatus?.visaNumber),
      visaExpiry: normalizeText(raw.foreignStatus?.visaExpiry),
      dateOfEntryUs: normalizeText(raw.foreignStatus?.dateOfEntryUs),
      identificationType: normalizeText(raw.foreignStatus?.identificationType),
      identificationIssuer: normalizeText(raw.foreignStatus?.identificationIssuer),
      identificationNumber: normalizeText(raw.foreignStatus?.identificationNumber),
      identificationExpiry: normalizeText(raw.foreignStatus?.identificationExpiry),
      previousItinReceived: normalizeText(raw.foreignStatus?.previousItinReceived),
      priorItin: normalizeText(raw.foreignStatus?.priorItin),
      priorIrsn: normalizeText(raw.foreignStatus?.priorIrsn),
      priorIssuedName: normalizeText(raw.foreignStatus?.priorIssuedName),
    },
    reason: {
      code: normalizeText(raw.reason?.code).toLowerCase(),
      treatyCountry: normalizeText(raw.reason?.treatyCountry),
      treatyArticle: normalizeText(raw.reason?.treatyArticle),
      relationshipToCitizen: normalizeText(raw.reason?.relationshipToCitizen),
      sponsorName: normalizeText(raw.reason?.sponsorName),
      sponsorTin: normalizeText(raw.reason?.sponsorTin),
      visaHolderName: normalizeText(raw.reason?.visaHolderName),
      visaHolderRelationship: normalizeText(raw.reason?.visaHolderRelationship),
      collegeOrCompanyName: normalizeText(raw.reason?.collegeOrCompanyName),
      collegeOrCompanyCityState: normalizeText(raw.reason?.collegeOrCompanyCityState),
      lengthOfStay: normalizeText(raw.reason?.lengthOfStay),
      otherDescription: normalizeText(raw.reason?.otherDescription),
    },
    mailingAddress: {
      line1: normalizeText(raw.mailingAddress?.line1),
      line2: normalizeText(raw.mailingAddress?.line2),
      city: normalizeText(raw.mailingAddress?.city),
      stateProvince: normalizeText(raw.mailingAddress?.stateProvince),
      postalCode: normalizeText(raw.mailingAddress?.postalCode),
      country: normalizeText(raw.mailingAddress?.country),
    },
    foreignAddress: {
      line1: normalizeText(raw.foreignAddress?.line1),
      line2: normalizeText(raw.foreignAddress?.line2),
      city: normalizeText(raw.foreignAddress?.city),
      stateProvince: normalizeText(raw.foreignAddress?.stateProvince),
      postalCode: normalizeText(raw.foreignAddress?.postalCode),
      country: normalizeText(raw.foreignAddress?.country),
    },
    supportingDocuments: {
      selected: selectedDocuments,
      taxReturnIncluded: normalizeBoolean(raw.supportingDocuments?.taxReturnIncluded),
      exceptionClaimed: normalizeBoolean(raw.supportingDocuments?.exceptionClaimed),
      needsResidencyProof: normalizeBoolean(raw.supportingDocuments?.needsResidencyProof),
      documentNotes: normalizeText(raw.supportingDocuments?.documentNotes),
    },
    acknowledgements: {
      privateService: normalizeBoolean(raw.acknowledgements?.privateService),
      irsFeeNotice: normalizeBoolean(raw.acknowledgements?.irsFeeNotice),
      accuracy: normalizeBoolean(raw.acknowledgements?.accuracy),
      consentContact: normalizeBoolean(raw.acknowledgements?.consentContact),
      eSignatureName: normalizeText(raw.acknowledgements?.eSignatureName),
    },
  };
}

function validateApplication(application) {
  const errors = [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const reason = getReasonByCode(application.reason.code);

  [
    ['personal.firstName', application.personal.firstName, 'First name is required.'],
    ['personal.lastName', application.personal.lastName, 'Last name is required.'],
    ['personal.dateOfBirth', application.personal.dateOfBirth, 'Date of birth is required.'],
    ['personal.gender', application.personal.gender, 'Gender selection is required.'],
    ['personal.countryOfBirth', application.personal.countryOfBirth, 'Country of birth is required.'],
    ['personal.countryOfCitizenship', application.personal.countryOfCitizenship, 'Country of citizenship is required.'],
    ['contact.email', application.contact.email, 'Email address is required.'],
    ['contact.phone', application.contact.phone, 'Phone number is required.'],
    ['foreignStatus.identificationType', application.foreignStatus.identificationType, 'An identification document type is required.'],
    ['foreignStatus.identificationIssuer', application.foreignStatus.identificationIssuer, 'Document issuer is required.'],
    ['foreignStatus.identificationNumber', application.foreignStatus.identificationNumber, 'Document number is required.'],
    ['foreignStatus.identificationExpiry', application.foreignStatus.identificationExpiry, 'Document expiration date is required.'],
    ['reason.code', application.reason.code, 'Please select the reason for the ITIN application.'],
    ['mailingAddress.line1', application.mailingAddress.line1, 'Mailing address line 1 is required.'],
    ['mailingAddress.city', application.mailingAddress.city, 'Mailing city is required.'],
    ['mailingAddress.stateProvince', application.mailingAddress.stateProvince, 'Mailing state or province is required.'],
    ['mailingAddress.postalCode', application.mailingAddress.postalCode, 'Mailing postal code is required.'],
    ['mailingAddress.country', application.mailingAddress.country, 'Mailing country is required.'],
    ['foreignAddress.line1', application.foreignAddress.line1, 'Foreign address line 1 is required.'],
    ['foreignAddress.city', application.foreignAddress.city, 'Foreign city is required.'],
    ['foreignAddress.stateProvince', application.foreignAddress.stateProvince, 'Foreign state or province is required.'],
    ['foreignAddress.postalCode', application.foreignAddress.postalCode, 'Foreign postal code is required.'],
    ['foreignAddress.country', application.foreignAddress.country, 'Foreign country is required.'],
    ['acknowledgements.eSignatureName', application.acknowledgements.eSignatureName, 'Electronic signature is required.'],
  ].forEach(([field, value, message]) => {
    if (!value) errors.push({ field, message });
  });

  if (application.contact.email && !emailPattern.test(application.contact.email)) {
    errors.push({ field: 'contact.email', message: 'Please enter a valid email address.' });
  }

  if (!reason) {
    errors.push({ field: 'reason.code', message: 'The selected ITIN reason is not valid.' });
  }

  if (!application.supportingDocuments.selected.length) {
    errors.push({ field: 'supportingDocuments.selected', message: 'Select at least one supporting document.' });
  }

  if (!application.acknowledgements.privateService) {
    errors.push({
      field: 'acknowledgements.privateService',
      message: 'You must acknowledge that this is a private assistance service.',
    });
  }

  if (!application.acknowledgements.irsFeeNotice) {
    errors.push({
      field: 'acknowledgements.irsFeeNotice',
      message: 'You must acknowledge the fee disclosure before continuing.',
    });
  }

  if (!application.acknowledgements.accuracy) {
    errors.push({
      field: 'acknowledgements.accuracy',
      message: 'You must confirm that the information is accurate to continue.',
    });
  }

  if (['a', 'f'].includes(application.reason.code)) {
    if (!application.reason.treatyCountry) {
      errors.push({ field: 'reason.treatyCountry', message: 'Treaty country is required for this reason.' });
    }
    if (!application.reason.treatyArticle) {
      errors.push({ field: 'reason.treatyArticle', message: 'Treaty article number is required for this reason.' });
    }
  }

  if (application.reason.code === 'f') {
    ['collegeOrCompanyName', 'collegeOrCompanyCityState', 'lengthOfStay'].forEach((fieldName) => {
      if (!application.reason[fieldName]) {
        errors.push({
          field: `reason.${fieldName}`,
          message: 'Student, professor, or researcher applications require school or company details.',
        });
      }
    });
  }

  if (['d', 'e'].includes(application.reason.code)) {
    ['relationshipToCitizen', 'sponsorName', 'sponsorTin'].forEach((fieldName) => {
      if (!application.reason[fieldName]) {
        errors.push({
          field: `reason.${fieldName}`,
          message: 'Relationship and related U.S. taxpayer details are required for this reason.',
        });
      }
    });
  }

  if (application.reason.code === 'g') {
    ['visaHolderName', 'visaHolderRelationship'].forEach((fieldName) => {
      if (!application.reason[fieldName]) {
        errors.push({
          field: `reason.${fieldName}`,
          message: 'Visa-holder details are required for this reason.',
        });
      }
    });
  }

  if (application.reason.code === 'h' && !application.reason.otherDescription) {
    errors.push({
      field: 'reason.otherDescription',
      message: 'Please describe the reason that applies under Form W-7 box h.',
    });
  }

  if (application.applicationType === 'renewal') {
    if (application.foreignStatus.previousItinReceived !== 'yes') {
      errors.push({
        field: 'foreignStatus.previousItinReceived',
        message: 'A renewal application must indicate that the applicant previously received an ITIN or IRSN.',
      });
    }

    if (!application.foreignStatus.priorItin && !application.foreignStatus.priorIrsn) {
      errors.push({
        field: 'foreignStatus.priorItin',
        message: 'Enter the prior ITIN or IRSN for a renewal request.',
      });
    }
  }

  if (application.foreignStatus.previousItinReceived === 'yes' && !application.foreignStatus.priorIssuedName) {
    errors.push({
      field: 'foreignStatus.priorIssuedName',
      message: 'Enter the name under which the prior ITIN or IRSN was issued.',
    });
  }

  return errors;
}

async function adminPasswordMatches(inputPassword) {
  if (adminConfig.password.startsWith('$2a$') || adminConfig.password.startsWith('$2b$') || adminConfig.password.startsWith('$2y$')) {
    return bcrypt.compare(inputPassword, adminConfig.password);
  }
  return inputPassword === adminConfig.password;
}

function requireAdmin(req, res, next) {
  if (req.session?.adminAuthenticated) {
    return next();
  }
  return res.redirect('/admin/login');
}

app.get('/', (req, res) => {
  res.render(
    'home',
    makePage('home', {
      bodyClass: 'home-page',
      pageTitle: 'ITIN Number | Individual Taxpayer Identification Services',
      metaDescription:
        'Private ITIN assistance service with guided W-7 preparation help, fee disclosure, secure intake, and clear notice that we are not the IRS.',
      canonical: site.baseUrl,
      structuredData: buildHomeStructuredData(),
      initialDraft: null,
      wizardMode: 'inline',
    })
  );
});

app.get('/apply', (req, res) => {
  const savedDraft = req.query.draft ? getDraft(String(req.query.draft)) : null;
  const presetType = req.query.type === 'renewal' ? 'renewal' : 'new';

  res.render(
    'apply',
    makePage('apply', {
      bodyClass: 'apply-page',
      pageTitle: 'Start ITIN Application Assistance',
      metaDescription:
        'Begin your private ITIN assistance application with a secure multi-step intake and clear compliance disclosures.',
      canonical: `${site.baseUrl}/apply`,
      initialDraft: savedDraft ? savedDraft.payload : { applicationType: presetType },
      wizardMode: 'standalone',
      draftMeta: savedDraft,
    })
  );
});

app.get('/thank-you/:trackingCode', (req, res) => {
  const application = getApplicationByTrackingCode(req.params.trackingCode);
  if (!application) {
    return res.status(404).render(
      'track',
      makePage('track', {
        bodyClass: 'track-page',
        pageTitle: 'Track ITIN Assistance Request',
        trackingError: 'We could not find that tracking code.',
      })
    );
  }

  res.render(
    'thank-you',
    makePage('thank-you', {
      bodyClass: 'thank-you-page',
      pageTitle: 'Application Received',
      application,
      trackUrl: buildTrackUrl(application),
    })
  );
});

app.get('/track', (req, res) => {
  let trackingResult = null;
  let trackingError = '';

  const code = normalizeText(req.query.code);
  const email = normalizeEmail(req.query.email);

  if (code || email) {
    const application = getApplicationByTrackingCode(code);
    if (!application || application.contact.email !== email) {
      trackingError = 'We could not match that tracking code and email address.';
    } else {
      trackingResult = application;
    }
  }

  res.render(
    'track',
    makePage('track', {
      bodyClass: 'track-page',
      pageTitle: 'Track ITIN Assistance Request',
      trackingResult,
      trackingError,
      trackingCodeQuery: code,
      trackingEmailQuery: email,
    })
  );
});

app.get('/privacy', (req, res) => {
  res.render(
    'privacy',
    makePage('privacy', {
      bodyClass: 'legal-page',
      pageTitle: 'Privacy Policy',
    })
  );
});

app.get('/services-pricing', (req, res) => {
  res.render(
    'services-pricing',
    makePage('services-pricing', {
      bodyClass: 'legal-page',
      pageTitle: 'Services & Pricing',
      canonical: `${site.baseUrl}/services-pricing`,
      metaDescription:
        'Review our private ITIN assistance services, pricing, cancellation terms, and customer support details.',
    })
  );
});

app.get('/contact', (req, res) => {
  res.render(
    'contact',
    makePage('contact', {
      bodyClass: 'contact-page',
      pageTitle: 'Contact Us',
      canonical: `${site.baseUrl}/contact`,
      metaDescription:
        'Contact our private ITIN assistance service for application questions, order updates, and customer support.',
      contactSubmitted: req.query.submitted === '1',
    })
  );
});

app.post('/contact', submissionLimiter, async (req, res) => {
  const contactForm = {
    firstName: normalizeText(req.body.firstName),
    lastName: normalizeText(req.body.lastName),
    email: normalizeEmail(req.body.email),
    phone: normalizeText(req.body.phone),
    orderNumber: normalizeText(req.body.orderNumber),
    message: normalizeText(req.body.message),
  };

  if (!contactForm.firstName || !contactForm.lastName || !contactForm.email || !contactForm.message) {
    return res.status(400).render(
      'contact',
      makePage('contact', {
        bodyClass: 'contact-page',
        pageTitle: 'Contact Us',
        canonical: `${site.baseUrl}/contact`,
        metaDescription:
          'Contact our private ITIN assistance service for application questions, order updates, and customer support.',
        contactError: 'Please complete the required fields before submitting your message.',
        contactForm,
      })
    );
  }

  try {
    await sendContactNotification(contactForm);
  } catch (error) {
    return res.status(500).render(
      'contact',
      makePage('contact', {
        bodyClass: 'contact-page',
        pageTitle: 'Contact Us',
        canonical: `${site.baseUrl}/contact`,
        metaDescription:
          'Contact our private ITIN assistance service for application questions, order updates, and customer support.',
        contactError: 'We could not send your message at this time. Please try again shortly.',
        contactForm,
      })
    );
  }

  return res.redirect('/contact?submitted=1');
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/apply', '/track', '/privacy', '/terms', '/contact', '/services-pricing'];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) => `  <url><loc>${site.baseUrl}${url}</loc></url>`
    ),
    '</urlset>',
  ].join('\n');

  res.type('application/xml');
  res.send(xml);
});

app.get('/terms', (req, res) => {
  res.render(
    'terms',
    makePage('terms', {
      bodyClass: 'legal-page',
      pageTitle: 'Terms of Service',
    })
  );
});

app.get('/track/:trackingCode/pdf', async (req, res, next) => {
  try {
    const application = getApplicationByTrackingCode(req.params.trackingCode);
    const email = normalizeEmail(req.query.email);

    if (!application || application.contact.email !== email) {
      return res.status(404).send('Application not found.');
    }

    const pdfBuffer = await createW7PdfBuffer(application);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${application.trackingCode}-w7-summary.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/drafts', draftLimiter, (req, res) => {
  const payload = sanitizeApplicationPayload(req.body);
  const draftId = payload.draftId || uuidv4();

  saveDraft(draftId, {
    ...payload,
    draftId,
  });

  const resumeUrl = `${site.baseUrl}/apply?draft=${encodeURIComponent(draftId)}`;
  return res.json({
    ok: true,
    draftId,
    resumeUrl,
    message: 'Draft saved securely on this server.',
  });
});

app.get('/api/drafts/:draftId', (req, res) => {
  const draft = getDraft(req.params.draftId);
  if (!draft) {
    return res.status(404).json({ ok: false, message: 'Draft not found.' });
  }
  return res.json({ ok: true, draft });
});

app.post('/api/applications', submissionLimiter, async (req, res) => {
  const payload = sanitizeApplicationPayload(req.body);
  const errors = validateApplication(payload);

  if (errors.length) {
    return res.status(400).json({
      ok: false,
      message: 'Please review the required fields and try again.',
      errors,
    });
  }

  const reason = getReasonByCode(payload.reason.code);
  const application = {
    id: uuidv4(),
    trackingCode: buildTrackingCode(),
    status: 'Submitted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    applicationType: payload.applicationType,
    personal: payload.personal,
    contact: payload.contact,
    foreignStatus: payload.foreignStatus,
    reason: {
      ...payload.reason,
      label: reason ? reason.label : payload.reason.code,
    },
    mailingAddress: payload.mailingAddress,
    foreignAddress: payload.foreignAddress,
    supportingDocuments: payload.supportingDocuments,
    acknowledgements: payload.acknowledgements,
  };

  application.w7Summary = buildW7Summary(application);
  saveApplication(application);

  if (payload.draftId) {
    deleteDraft(payload.draftId);
  }

  let emailStatus = 'not-sent';
  try {
    const emailResult = await sendApplicationConfirmation({
      application,
      trackingUrl: buildTrackUrl(application),
    });
    emailStatus = emailResult.status;
  } catch (error) {
    emailStatus = 'failed';
  }

  updateApplication(application.id, {
    emailStatus,
  });

  return res.json({
    ok: true,
    trackingCode: application.trackingCode,
    redirectUrl: `/thank-you/${application.trackingCode}`,
  });
});

app.get('/admin/login', (req, res) => {
  if (req.session?.adminAuthenticated) {
    return res.redirect('/admin');
  }

  return res.render(
    'admin-login',
    makePage('admin-login', {
      bodyClass: 'admin-page',
      pageTitle: 'Admin Login',
      loginError: '',
    })
  );
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = normalizeText(req.body.password);

  if (email === adminConfig.email && (await adminPasswordMatches(password))) {
    req.session.adminAuthenticated = true;
    req.session.adminEmail = email;
    return res.redirect('/admin');
  }

  return res.status(401).render(
    'admin-login',
    makePage('admin-login', {
      bodyClass: 'admin-page',
      pageTitle: 'Admin Login',
      loginError: 'Invalid email or password.',
    })
  );
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin', requireAdmin, (req, res) => {
  const applications = listApplications();
  return res.render(
    'admin-dashboard',
    makePage('admin-dashboard', {
      bodyClass: 'admin-page',
      pageTitle: 'Admin Dashboard',
      applications,
      adminEmail: req.session.adminEmail,
    })
  );
});

app.get('/admin/applications/:id', requireAdmin, (req, res) => {
  const application = getApplicationById(req.params.id);
  if (!application) {
    return res.status(404).redirect('/admin');
  }

  return res.render(
    'admin-application',
    makePage('admin-application', {
      bodyClass: 'admin-page',
      pageTitle: `Application ${application.trackingCode}`,
      application,
    })
  );
});

app.post('/admin/applications/:id/status', requireAdmin, (req, res) => {
  const requestedStatus = normalizeText(req.body.status);
  if (!applicationStatuses.includes(requestedStatus)) {
    return res.redirect(`/admin/applications/${req.params.id}`);
  }

  updateApplication(req.params.id, {
    status: requestedStatus,
  });
  return res.redirect(`/admin/applications/${req.params.id}`);
});

app.get('/admin/applications/:id/pdf', requireAdmin, async (req, res, next) => {
  try {
    const application = getApplicationById(req.params.id);
    if (!application) {
      return res.status(404).send('Application not found.');
    }

    const pdfBuffer = await createW7PdfBuffer(application);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${application.trackingCode}-w7-summary.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).render(
    'track',
    makePage('track', {
      bodyClass: 'track-page',
      pageTitle: 'Page Not Found',
      trackingError: 'The page you requested could not be found.',
    })
  );
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send('An unexpected error occurred.');
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`ITIN assistance site running at ${site.baseUrl}`);
});

server.on('error', (error) => {
  console.error(error);
});
