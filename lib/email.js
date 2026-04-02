const nodemailer = require('nodemailer');
const { appendEmailLog } = require('./storage');

function buildTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendApplicationConfirmation({ application, trackingUrl }) {
  const fromAddress = process.env.SMTP_FROM || `${process.env.BUSINESS_NAME || 'Private ITIN Assistance Service'} <no-reply@example.com>`;
  const subject = `ITIN application received: ${application.trackingCode}`;
  const text = [
    `Thank you for choosing ${process.env.BUSINESS_NAME || 'our private ITIN assistance service'}.`,
    '',
    'We received your request for guided ITIN application support.',
    `Tracking code: ${application.trackingCode}`,
    `Application status: ${application.status}`,
    '',
    'Important disclosure:',
    'We are not the IRS. We are a private company that provides assistance with ITIN applications.',
    '',
    `Track your application: ${trackingUrl}`,
  ].join('\n');

  const transport = buildTransport();

  if (!transport) {
    appendEmailLog({
      to: application.contact.email,
      from: fromAddress,
      subject,
      text,
      trackingCode: application.trackingCode,
      status: 'logged-only',
    });
    return { status: 'logged-only' };
  }

  await transport.sendMail({
    from: fromAddress,
    to: application.contact.email,
    subject,
    text,
  });

  return { status: 'sent' };
}

async function sendApplicationNotification({ application, trackingUrl }) {
  const fromAddress = process.env.SMTP_FROM || `${process.env.BUSINESS_NAME || 'Private ITIN Assistance Service'} <no-reply@example.com>`;
  const toAddress = process.env.CONTACT_NOTIFICATION_TO || process.env.SUPPORT_EMAIL || 'contact@etaxids.com';
  const subject = `New ITIN application: ${application.trackingCode}`;
  const text = [
    'A new ITIN application was submitted on the website.',
    '',
    `Tracking code: ${application.trackingCode}`,
    `Application type: ${application.applicationType === 'renewal' ? 'Renewal' : 'New ITIN'}`,
    `Reason: ${application.reason.label || application.reason.code}`,
    '',
    `Applicant: ${application.personal.firstName} ${application.personal.lastName}`.trim(),
    `Email: ${application.contact.email}`,
    `Phone: ${application.contact.phone || 'Not provided'}`,
    `Date of birth: ${application.personal.dateOfBirth || 'Not provided'}`,
    '',
    'Mailing address:',
    [
      application.mailingAddress.line1,
      application.mailingAddress.line2,
      application.mailingAddress.city,
      application.mailingAddress.stateProvince,
      application.mailingAddress.postalCode,
      application.mailingAddress.country,
    ].filter(Boolean).join(', '),
    '',
    `Tracking link: ${trackingUrl}`,
  ].join('\n');

  const transport = buildTransport();

  if (!transport) {
    appendEmailLog({
      to: toAddress,
      from: fromAddress,
      replyTo: application.contact.email,
      subject,
      text,
      trackingCode: application.trackingCode,
      type: 'application-notification',
      status: 'logged-only',
    });
    return { status: 'logged-only' };
  }

  await transport.sendMail({
    from: fromAddress,
    to: toAddress,
    replyTo: application.contact.email,
    subject,
    text,
  });

  return { status: 'sent' };
}

async function sendContactNotification(contactForm) {
  const fromAddress = process.env.SMTP_FROM || `${process.env.BUSINESS_NAME || 'Private ITIN Assistance Service'} <no-reply@example.com>`;
  const toAddress = process.env.CONTACT_NOTIFICATION_TO || process.env.SUPPORT_EMAIL || 'contact@etaxids.com';
  const subject = `New contact request from ${contactForm.firstName} ${contactForm.lastName}`;
  const text = [
    'A new contact request was submitted on the website.',
    '',
    `Name: ${contactForm.firstName} ${contactForm.lastName}`,
    `Email: ${contactForm.email}`,
    `Phone: ${contactForm.phone || 'Not provided'}`,
    `Order #: ${contactForm.orderNumber || 'Not provided'}`,
    '',
    'Message:',
    contactForm.message,
  ].join('\n');

  const transport = buildTransport();

  if (!transport) {
    appendEmailLog({
      to: toAddress,
      from: fromAddress,
      replyTo: contactForm.email,
      subject,
      text,
      type: 'contact-notification',
      status: 'logged-only',
    });
    return { status: 'logged-only' };
  }

  await transport.sendMail({
    from: fromAddress,
    to: toAddress,
    replyTo: contactForm.email,
    subject,
    text,
  });

  return { status: 'sent' };
}

module.exports = {
  sendApplicationConfirmation,
  sendApplicationNotification,
  sendContactNotification,
};
