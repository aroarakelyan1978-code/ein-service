const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

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

function wrapText(text, maxWidth, font, size) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const candidateWidth = font.widthOfTextAtSize(candidate, size);
    if (candidateWidth <= maxWidth || !current) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines;
}

async function createW7PdfBuffer(application) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const textColor = rgb(0.11, 0.2, 0.37);
  const mutedColor = rgb(0.38, 0.45, 0.57);
  const summary = buildW7Summary(application);

  let y = 748;
  const margin = 50;
  const width = 512;

  page.drawText('W-7 Preparation Summary', {
    x: margin,
    y,
    size: 22,
    font: fontBold,
    color: textColor,
  });
  y -= 28;

  page.drawText('Private ITIN Assistance Service | Prepared packet summary for review before submission', {
    x: margin,
    y,
    size: 10,
    font,
    color: mutedColor,
  });
  y -= 24;

  const sections = [
    ['Tracking Code', application.trackingCode],
    ['Application Type', summary.applicationType],
    ['Reason', summary.reason],
    ['Applicant Name', summary.formLines.line1a],
    ['Name At Birth', summary.formLines.line1b || 'Not provided'],
    ['Mailing Address', summary.formLines.line2],
    ['Foreign Address', summary.formLines.line3],
    ['Birth Information', summary.formLines.line4],
    ['Gender', summary.formLines.line5],
    ['Country of Citizenship', summary.formLines.line6a],
    ['Foreign Tax ID', summary.formLines.line6b || 'Not provided'],
    ['Visa Information', summary.formLines.line6c || 'Not provided'],
    ['Identification Document', summary.formLines.line6d || 'Not provided'],
    ['Previous ITIN / IRSN', summary.formLines.line6f || 'Not provided'],
    ['School or Company', summary.formLines.line6g || 'Not provided'],
    ['Selected Supporting Documents', application.supportingDocuments.selected.join(', ') || 'None listed'],
    ['Document Notes', application.supportingDocuments.documentNotes || 'None provided'],
    ['Private Service Disclosure', 'We are not the IRS. We are a private company that provides assistance with ITIN applications.'],
  ];

  sections.forEach(([label, value]) => {
    if (y < 80) {
      y = 748;
      page = pdf.addPage([612, 792]);
    }

    page.drawText(label, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: textColor,
    });
    y -= 14;

    wrapText(value, width, font, 11).forEach((line) => {
      page.drawText(line, {
        x: margin,
        y,
        size: 11,
        font,
        color: rgb(0.13, 0.16, 0.21),
      });
      y -= 14;
    });

    y -= 8;
  });

  return Buffer.from(await pdf.save());
}

module.exports = {
  reasonOptions,
  documentOptions,
  getReasonByCode,
  buildW7Summary,
  createW7PdfBuffer,
};
