const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const OFFICIAL_W7_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'fw7-official.pdf');

const reasonOptions = [
  {
    code: 'a',
    label: 'Nonresident alien required to claim a tax treaty benefit',
    description: 'Use when the applicant needs an ITIN to claim treaty benefits and must also complete the additional treaty details.',
    requiresTaxReturn: false,
  },
  {
    code: 'b',
    label: 'Nonresident alien filing a U.S. federal tax return',
    description: 'Use for a nonresident alien who needs an ITIN to file a U.S. federal tax return.',
    requiresTaxReturn: true,
  },
  {
    code: 'c',
    label: 'U.S. resident alien filing a U.S. federal tax return',
    description: 'Use when the applicant meets resident status rules and needs an ITIN for a tax return.',
    requiresTaxReturn: true,
  },
  {
    code: 'd',
    label: 'Dependent of a U.S. citizen or resident alien',
    description: 'Use for eligible dependents claimed on a return or for another allowable tax benefit.',
    requiresTaxReturn: true,
  },
  {
    code: 'e',
    label: 'Spouse of a U.S. citizen or resident alien',
    description: 'Use when the applicant is the spouse of a U.S. citizen or resident alien and needs an ITIN for tax filing.',
    requiresTaxReturn: true,
  },
  {
    code: 'f',
    label: 'Nonresident alien student, professor, or researcher',
    description: 'Use when the applicant is a nonresident alien student, professor, or researcher filing a return or claiming an exception.',
    requiresTaxReturn: false,
  },
  {
    code: 'g',
    label: 'Dependent or spouse of a nonresident alien holding a U.S. visa',
    description: 'Use for an eligible spouse or dependent tied to a nonresident alien visa holder.',
    requiresTaxReturn: true,
  },
  {
    code: 'h',
    label: 'Other reason listed in the Form W-7 instructions',
    description: 'Use when the applicant fits another IRS-approved exception or filing reason.',
    requiresTaxReturn: false,
  },
];

const documentOptions = [
  'Passport',
  'USCIS photo identification',
  'U.S. visa',
  "U.S. driver's license",
  'U.S. military identification card',
  "Foreign driver's license",
  'Foreign military identification card',
  'National identification card',
  'U.S. state identification card',
  "Foreign voter's registration card",
  'Civil birth certificate',
  'Medical records',
  'School records',
];

function getReasonByCode(code) {
  return reasonOptions.find((option) => option.code === code) || null;
}

function compactLines(lines) {
  return lines.filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
}

function buildW7Summary(application) {
  const reason = getReasonByCode(application.reason.code);

  return {
    applicationType: application.applicationType === 'renewal' ? 'Renew an existing ITIN' : 'Apply for a new ITIN',
    reason: reason ? `${reason.code.toUpperCase()}. ${reason.label}` : application.reason.code,
    formLines: {
      line1a: compactLines([
        application.personal.firstName,
        application.personal.middleName,
        application.personal.lastName,
      ]).join(' '),
      line1b: compactLines([
        application.personal.birthFirstName,
        application.personal.birthMiddleName,
        application.personal.birthLastName,
      ]).join(' '),
      line2: compactLines([
        application.mailingAddress.line1,
        application.mailingAddress.line2,
        `${application.mailingAddress.city}, ${application.mailingAddress.stateProvince} ${application.mailingAddress.postalCode}`,
        application.mailingAddress.country,
      ]).join(' | '),
      line3: compactLines([
        application.foreignAddress.line1,
        application.foreignAddress.line2,
        `${application.foreignAddress.city}, ${application.foreignAddress.stateProvince} ${application.foreignAddress.postalCode}`,
        application.foreignAddress.country,
      ]).join(' | '),
      line4: `${application.personal.dateOfBirth || ''} | ${application.personal.countryOfBirth || ''} | ${application.personal.cityProvinceOfBirth || ''}`,
      line5: application.personal.gender || '',
      line6a: application.personal.countryOfCitizenship || '',
      line6b: application.foreignStatus.foreignTaxId || '',
      line6c: compactLines([
        application.foreignStatus.visaType,
        application.foreignStatus.visaNumber,
        application.foreignStatus.visaExpiry,
      ]).join(' | '),
      line6d: compactLines([
        application.foreignStatus.identificationType,
        application.foreignStatus.identificationIssuer,
        application.foreignStatus.identificationNumber,
        application.foreignStatus.identificationExpiry,
      ]).join(' | '),
      line6e: application.foreignStatus.previousItinReceived || '',
      line6f: compactLines([
        application.foreignStatus.priorItin,
        application.foreignStatus.priorIrsn,
        application.foreignStatus.priorIssuedName,
      ]).join(' | '),
      line6g: compactLines([
        application.reason.collegeOrCompanyName,
        application.reason.collegeOrCompanyCityState,
        application.reason.lengthOfStay,
      ]).join(' | '),
    },
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhoneNumber(value) {
  const digits = normalizeDigits(value);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return normalizeText(value);
}

function parseDateParts(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const simpleMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (simpleMatch) {
    return {
      year: simpleMatch[1],
      month: simpleMatch[2],
      day: simpleMatch[3],
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    year: String(parsed.getUTCFullYear()),
    month: String(parsed.getUTCMonth() + 1).padStart(2, '0'),
    day: String(parsed.getUTCDate()).padStart(2, '0'),
  };
}

function formatDateForForm(value) {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.month}/${parts.day}/${parts.year}`;
}

function formatCompactDateForForm(value) {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.month}${parts.day}${parts.year}`;
}

function splitIdSegments(value) {
  const digits = normalizeDigits(value);
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)];
}

function buildSecondAddressLine(address) {
  const cityStatePostal = compactLines([
    address.city,
    compactLines([address.stateProvince, address.postalCode]).join(' '),
  ]).join(', ');

  return compactLines([cityStatePostal, address.country]).join(', ');
}

function buildVisaInfo(application) {
  const expiry = formatDateForForm(application.foreignStatus.visaExpiry);
  return compactLines([
    application.foreignStatus.visaType,
    application.foreignStatus.visaNumber,
    expiry ? `Exp ${expiry}` : '',
  ]).join(' | ');
}

function buildIdentificationOtherLabel(application) {
  const normalized = normalizeText(application.foreignStatus.identificationType).toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('passport')) return '';
  if (normalized.includes('driver') || normalized.includes('state')) return '';
  if (normalized.includes('uscis')) return '';
  return application.foreignStatus.identificationType;
}

function buildReasonExplanation(application) {
  const explicit = normalizeText(application.reason.otherDescription);
  if (explicit) return explicit;

  if (application.reason.code === 'a') {
    return 'Tax treaty benefit claim. See treaty country and article details.';
  }

  if (application.reason.code === 'f' && application.supportingDocuments?.exceptionClaimed) {
    return 'Student, professor, or researcher exception claim.';
  }

  return '';
}

function checkW7TemplateHealth() {
  try {
    fs.accessSync(OFFICIAL_W7_TEMPLATE_PATH, fs.constants.R_OK);
    const stats = fs.statSync(OFFICIAL_W7_TEMPLATE_PATH);
    return {
      ok: stats.size > 0,
      path: OFFICIAL_W7_TEMPLATE_PATH,
      size: stats.size,
      error: stats.size > 0 ? '' : 'Official W-7 template is empty.',
    };
  } catch (error) {
    return {
      ok: false,
      path: OFFICIAL_W7_TEMPLATE_PATH,
      size: 0,
      error: error.message,
    };
  }
}

function getField(form, name) {
  try {
    return form.getField(name);
  } catch (error) {
    return null;
  }
}

function setTextField(form, name, value, fontSize = 9) {
  const field = getField(form, name);
  if (!field || field.constructor.name !== 'PDFTextField') return;

  const maxLength = field.getMaxLength();
  const text = normalizeText(value);
  const safeText = maxLength ? text.slice(0, maxLength) : text;
  field.setText(safeText);
  field.setFontSize(fontSize);
}

function setCheckbox(form, name, checked) {
  const field = getField(form, name);
  if (!field || field.constructor.name !== 'PDFCheckBox') return;
  if (checked) {
    field.check();
  } else {
    field.uncheck();
  }
}

function populateReasonFields(form, application) {
  const reasonCode = application.reason.code;
  const checkboxMap = {
    a: 'topmostSubform[0].Page1[0].c1_2[0]',
    b: 'topmostSubform[0].Page1[0].c1_3[0]',
    c: 'topmostSubform[0].Page1[0].c1_4[0]',
    d: 'topmostSubform[0].Page1[0].c1_5[0]',
    e: 'topmostSubform[0].Page1[0].c1_6[0]',
    f: 'topmostSubform[0].Page1[0].c1_7[0]',
    g: 'topmostSubform[0].Page1[0].c1_8[0]',
    h: 'topmostSubform[0].Page1[0].c1_9[0]',
  };

  Object.entries(checkboxMap).forEach(([code, fieldName]) => {
    setCheckbox(form, fieldName, code === reasonCode);
  });

  setTextField(form, 'topmostSubform[0].Page1[0].f1_01[0]', application.reason.relationshipToCitizen);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_02[0]', application.reason.sponsorTin);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_03[0]', application.reason.sponsorName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_04[0]', buildReasonExplanation(application), 8);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_05[0]', application.reason.treatyCountry);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_06[0]', application.reason.treatyArticle);
}

function populatePersonalFields(form, application) {
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_1[0]', application.applicationType !== 'renewal');
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_1[1]', application.applicationType === 'renewal');

  setTextField(form, 'topmostSubform[0].Page1[0].f1_07[0]', application.personal.firstName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_08[0]', application.personal.middleName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_09[0]', application.personal.lastName);

  setTextField(form, 'topmostSubform[0].Page1[0].f1_10[0]', application.personal.birthFirstName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_11[0]', application.personal.birthMiddleName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_12[0]', application.personal.birthLastName);

  setTextField(form, 'topmostSubform[0].Page1[0].f1_13[0]', compactLines([application.mailingAddress.line1, application.mailingAddress.line2]).join(' '), 8);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_14[0]', buildSecondAddressLine(application.mailingAddress), 8);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_15[0]', compactLines([application.foreignAddress.line1, application.foreignAddress.line2]).join(' '), 8);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_16[0]', buildSecondAddressLine(application.foreignAddress), 8);

  setTextField(form, 'topmostSubform[0].Page1[0].Line4_ReadOrder[0].f1_17[0]', formatCompactDateForForm(application.personal.dateOfBirth));
  setTextField(form, 'topmostSubform[0].Page1[0].f1_18[0]', application.personal.countryOfBirth);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_19[0]', application.personal.cityProvinceOfBirth);

  const gender = normalizeText(application.personal.gender).toLowerCase();
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_10[0]', gender === 'male');
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_10[1]', gender === 'female');
}

function populateTaxIdFields(form, application) {
  setTextField(form, 'topmostSubform[0].Page1[0].f1_20[0]', application.personal.countryOfCitizenship);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_21[0]', application.foreignStatus.foreignTaxId);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_22[0]', buildVisaInfo(application), 8);

  const identificationType = normalizeText(application.foreignStatus.identificationType).toLowerCase();
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_11[0]', identificationType.includes('passport'));
  setCheckbox(
    form,
    'topmostSubform[0].Page1[0].c1_11[1]',
    identificationType.includes('driver') || identificationType.includes('state')
  );
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_11[2]', identificationType.includes('uscis'));
  setCheckbox(
    form,
    'topmostSubform[0].Page1[0].c1_11[3]',
    !identificationType.includes('passport') &&
      !identificationType.includes('driver') &&
      !identificationType.includes('state') &&
      !identificationType.includes('uscis')
  );

  setTextField(form, 'topmostSubform[0].Page1[0].f1_23[0]', buildIdentificationOtherLabel(application));
  setTextField(form, 'topmostSubform[0].Page1[0].Issued_ReadOrder[0].f1_24[0]', application.foreignStatus.identificationIssuer);
  setTextField(form, 'topmostSubform[0].Page1[0].Issued_ReadOrder[0].f1_25[0]', application.foreignStatus.identificationNumber);
  setTextField(form, 'topmostSubform[0].Page1[0].Issued_ReadOrder[0].f1_26[0]', formatCompactDateForForm(application.foreignStatus.identificationExpiry));
  setTextField(form, 'topmostSubform[0].Page1[0].f1_27[0]', formatCompactDateForForm(application.foreignStatus.dateOfEntryUs));

  const hadPriorTin = normalizeText(application.foreignStatus.previousItinReceived).toLowerCase() === 'yes';
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_12[0]', !hadPriorTin);
  setCheckbox(form, 'topmostSubform[0].Page1[0].c1_12[1]', hadPriorTin);

  const [itinA, itinB, itinC] = splitIdSegments(application.foreignStatus.priorItin);
  const [irsnA, irsnB, irsnC] = splitIdSegments(application.foreignStatus.priorIrsn);
  setTextField(form, 'topmostSubform[0].Page1[0].ITIN[0].f1_28[0]', itinA);
  setTextField(form, 'topmostSubform[0].Page1[0].ITIN[0].f1_29[0]', itinB);
  setTextField(form, 'topmostSubform[0].Page1[0].ITIN[0].f1_30[0]', itinC);
  setTextField(form, 'topmostSubform[0].Page1[0].IRSN[0].f1_31[0]', irsnA);
  setTextField(form, 'topmostSubform[0].Page1[0].IRSN[0].f1_32[0]', irsnB);
  setTextField(form, 'topmostSubform[0].Page1[0].IRSN[0].f1_33[0]', irsnC);

  const priorIssuedName = compactLines([
    application.foreignStatus.priorIssuedName,
    compactLines([
      application.personal.birthFirstName,
      application.personal.birthMiddleName,
      application.personal.birthLastName,
    ]).join(' '),
    compactLines([
      application.personal.firstName,
      application.personal.middleName,
      application.personal.lastName,
    ]).join(' '),
  ])[0] || '';
  const [priorFirst = '', priorMiddle = '', ...priorLastParts] = priorIssuedName.split(/\s+/).filter(Boolean);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_34[0]', priorFirst);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_35[0]', priorMiddle);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_36[0]', priorLastParts.join(' '));

  setTextField(form, 'topmostSubform[0].Page1[0].f1_37[0]', application.reason.collegeOrCompanyName);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_38[0]', application.reason.collegeOrCompanyCityState);
  setTextField(form, 'topmostSubform[0].Page1[0].f1_39[0]', application.reason.lengthOfStay);
}

function drawApplicantSignature(pdf, application, font) {
  const page = pdf.getPages()[0];
  const signature = normalizeText(application.acknowledgements?.eSignatureName) || compactLines([
    application.personal.firstName,
    application.personal.middleName,
    application.personal.lastName,
  ]).join(' ');
  if (signature) {
    page.drawText(signature, {
      x: 112,
      y: 121,
      size: 11,
      font,
      color: rgb(0.15, 0.18, 0.24),
    });
  }
}

function populateSignatureFields(form, application) {
  setTextField(form, 'topmostSubform[0].Page1[0].f1_40[0]', formatDateForForm(application.createdAt || new Date().toISOString()));
  setTextField(form, 'topmostSubform[0].Page1[0].f1_41[0]', formatPhoneNumber(application.contact.phone));
}

async function createW7PdfBuffer(application) {
  const templateBytes = fs.readFileSync(OFFICIAL_W7_TEMPLATE_PATH);
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  populateReasonFields(form, application);
  populatePersonalFields(form, application);
  populateTaxIdFields(form, application);
  populateSignatureFields(form, application);
  form.updateFieldAppearances(font);
  drawApplicantSignature(pdf, application, font);
  form.flatten();

  return Buffer.from(await pdf.save());
}

module.exports = {
  reasonOptions,
  documentOptions,
  getReasonByCode,
  buildW7Summary,
  createW7PdfBuffer,
  checkW7TemplateHealth,
};
