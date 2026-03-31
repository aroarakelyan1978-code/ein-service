(function () {
  const configNode = document.getElementById('itin-form-config');
  let config = {};

  if (configNode) {
    try {
      config = JSON.parse(configNode.textContent || '{}');
    } catch (error) {
      config = {};
    }
  }

  const form = document.querySelector('[data-itin-form]');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.form-step'));
  const progressFill = form.querySelector('[data-progress-fill]');
  const progressPercent = form.querySelector('[data-progress-percent]');
  const progressCount = form.querySelector('[data-progress-count]');
  const progressLabels = Array.from(form.querySelectorAll('[data-progress-label]'));
  const statusNode = form.querySelector('[data-save-status]');
  const nextButton = form.querySelector('[data-next-step]');
  const prevButton = form.querySelector('[data-prev-step]');
  const submitButton = form.querySelector('[data-submit-form]');
  const saveButton = form.querySelector('[data-save-draft]');
  const storageKey = 'itin-assist-draft';
  let currentStep = 0;
  let saveTimer = null;
  let draftId = config.resumeDraftId || '';

  const stepRules = [
    [
      'applicationType',
      'contact.email',
      'contact.phone',
      'personal.firstName',
      'personal.lastName',
      'personal.dateOfBirth',
      'personal.gender',
      'personal.countryOfBirth',
      'personal.countryOfCitizenship',
    ],
    [
      'foreignStatus.identificationType',
      'foreignStatus.identificationIssuer',
      'foreignStatus.identificationNumber',
      'foreignStatus.identificationExpiry',
    ],
    ['reason.code'],
    [
      'mailingAddress.line1',
      'mailingAddress.city',
      'mailingAddress.stateProvince',
      'mailingAddress.postalCode',
      'mailingAddress.country',
      'foreignAddress.line1',
      'foreignAddress.city',
      'foreignAddress.stateProvince',
      'foreignAddress.postalCode',
      'foreignAddress.country',
      'supportingDocuments.selected',
      'acknowledgements.privateService',
      'acknowledgements.irsFeeNotice',
      'acknowledgements.accuracy',
      'acknowledgements.eSignatureName',
    ],
  ];

  function getNodes(name) {
    const field = form.elements.namedItem(name);
    if (!field) return [];
    if (typeof field.length === 'number' && !field.tagName) {
      return Array.from(field);
    }
    return [field];
  }

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message || '';
    statusNode.style.color = isError ? '#c0392b' : '';
  }

  function getValue(name) {
    const nodes = getNodes(name);
    if (!nodes.length) return '';
    const first = nodes[0];

    if (first.type === 'radio') {
      const checked = nodes.find((node) => node.checked);
      return checked ? checked.value : '';
    }

    if (first.type === 'checkbox') {
      if (nodes.length > 1) {
        return nodes.filter((node) => node.checked).map((node) => node.value);
      }
      return Boolean(first.checked);
    }

    return String(first.value || '').trim();
  }

  function setValue(name, value) {
    const nodes = getNodes(name);
    if (!nodes.length) return;
    const first = nodes[0];

    if (first.type === 'radio') {
      nodes.forEach((node) => {
        node.checked = node.value === value;
      });
      return;
    }

    if (first.type === 'checkbox') {
      if (nodes.length > 1) {
        const list = Array.isArray(value) ? value : [];
        nodes.forEach((node) => {
          node.checked = list.includes(node.value);
        });
        return;
      }
      first.checked = Boolean(value);
      return;
    }

    first.value = value || '';
  }

  function collectPayload() {
    return {
      draftId,
      applicationType: getValue('applicationType') || 'new',
      personal: {
        firstName: getValue('personal.firstName'),
        middleName: getValue('personal.middleName'),
        lastName: getValue('personal.lastName'),
        birthFirstName: getValue('personal.birthFirstName'),
        birthMiddleName: getValue('personal.birthMiddleName'),
        birthLastName: getValue('personal.birthLastName'),
        dateOfBirth: getValue('personal.dateOfBirth'),
        gender: getValue('personal.gender'),
        countryOfBirth: getValue('personal.countryOfBirth'),
        cityProvinceOfBirth: getValue('personal.cityProvinceOfBirth'),
        countryOfCitizenship: getValue('personal.countryOfCitizenship'),
      },
      contact: {
        email: getValue('contact.email'),
        phone: getValue('contact.phone'),
      },
      foreignStatus: {
        foreignTaxId: getValue('foreignStatus.foreignTaxId'),
        visaType: getValue('foreignStatus.visaType'),
        visaNumber: getValue('foreignStatus.visaNumber'),
        visaExpiry: getValue('foreignStatus.visaExpiry'),
        dateOfEntryUs: getValue('foreignStatus.dateOfEntryUs'),
        identificationType: getValue('foreignStatus.identificationType'),
        identificationIssuer: getValue('foreignStatus.identificationIssuer'),
        identificationNumber: getValue('foreignStatus.identificationNumber'),
        identificationExpiry: getValue('foreignStatus.identificationExpiry'),
        previousItinReceived: getValue('foreignStatus.previousItinReceived'),
        priorItin: getValue('foreignStatus.priorItin'),
        priorIrsn: getValue('foreignStatus.priorIrsn'),
        priorIssuedName: getValue('foreignStatus.priorIssuedName'),
      },
      reason: {
        code: getValue('reason.code'),
        treatyCountry: getValue('reason.treatyCountry'),
        treatyArticle: getValue('reason.treatyArticle'),
        relationshipToCitizen: getValue('reason.relationshipToCitizen'),
        sponsorName: getValue('reason.sponsorName'),
        sponsorTin: getValue('reason.sponsorTin'),
        visaHolderName: getValue('reason.visaHolderName'),
        visaHolderRelationship: getValue('reason.visaHolderRelationship'),
        collegeOrCompanyName: getValue('reason.collegeOrCompanyName'),
        collegeOrCompanyCityState: getValue('reason.collegeOrCompanyCityState'),
        lengthOfStay: getValue('reason.lengthOfStay'),
        otherDescription: getValue('reason.otherDescription'),
      },
      mailingAddress: {
        line1: getValue('mailingAddress.line1'),
        line2: getValue('mailingAddress.line2'),
        city: getValue('mailingAddress.city'),
        stateProvince: getValue('mailingAddress.stateProvince'),
        postalCode: getValue('mailingAddress.postalCode'),
        country: getValue('mailingAddress.country'),
      },
      foreignAddress: {
        line1: getValue('foreignAddress.line1'),
        line2: getValue('foreignAddress.line2'),
        city: getValue('foreignAddress.city'),
        stateProvince: getValue('foreignAddress.stateProvince'),
        postalCode: getValue('foreignAddress.postalCode'),
        country: getValue('foreignAddress.country'),
      },
      supportingDocuments: {
        selected: getValue('supportingDocuments.selected'),
        taxReturnIncluded: getValue('supportingDocuments.taxReturnIncluded'),
        exceptionClaimed: getValue('supportingDocuments.exceptionClaimed'),
        needsResidencyProof: getValue('supportingDocuments.needsResidencyProof'),
        documentNotes: getValue('supportingDocuments.documentNotes'),
      },
      acknowledgements: {
        privateService: getValue('acknowledgements.privateService'),
        irsFeeNotice: getValue('acknowledgements.irsFeeNotice'),
        accuracy: getValue('acknowledgements.accuracy'),
        consentContact: getValue('acknowledgements.consentContact'),
        eSignatureName: getValue('acknowledgements.eSignatureName'),
      },
    };
  }

  function populateFromData(data) {
    if (!data) return;
    draftId = data.draftId || draftId;

    const assignments = [
      'applicationType',
      'contact.email',
      'contact.phone',
      'personal.firstName',
      'personal.middleName',
      'personal.lastName',
      'personal.birthFirstName',
      'personal.birthMiddleName',
      'personal.birthLastName',
      'personal.dateOfBirth',
      'personal.gender',
      'personal.countryOfBirth',
      'personal.cityProvinceOfBirth',
      'personal.countryOfCitizenship',
      'foreignStatus.foreignTaxId',
      'foreignStatus.visaType',
      'foreignStatus.visaNumber',
      'foreignStatus.visaExpiry',
      'foreignStatus.dateOfEntryUs',
      'foreignStatus.identificationType',
      'foreignStatus.identificationIssuer',
      'foreignStatus.identificationNumber',
      'foreignStatus.identificationExpiry',
      'foreignStatus.previousItinReceived',
      'foreignStatus.priorItin',
      'foreignStatus.priorIrsn',
      'foreignStatus.priorIssuedName',
      'reason.code',
      'reason.treatyCountry',
      'reason.treatyArticle',
      'reason.relationshipToCitizen',
      'reason.sponsorName',
      'reason.sponsorTin',
      'reason.visaHolderName',
      'reason.visaHolderRelationship',
      'reason.collegeOrCompanyName',
      'reason.collegeOrCompanyCityState',
      'reason.lengthOfStay',
      'reason.otherDescription',
      'mailingAddress.line1',
      'mailingAddress.line2',
      'mailingAddress.city',
      'mailingAddress.stateProvince',
      'mailingAddress.postalCode',
      'mailingAddress.country',
      'foreignAddress.line1',
      'foreignAddress.line2',
      'foreignAddress.city',
      'foreignAddress.stateProvince',
      'foreignAddress.postalCode',
      'foreignAddress.country',
      'supportingDocuments.selected',
      'supportingDocuments.taxReturnIncluded',
      'supportingDocuments.exceptionClaimed',
      'supportingDocuments.needsResidencyProof',
      'supportingDocuments.documentNotes',
      'acknowledgements.privateService',
      'acknowledgements.irsFeeNotice',
      'acknowledgements.accuracy',
      'acknowledgements.consentContact',
      'acknowledgements.eSignatureName',
    ];

    assignments.forEach((path) => {
      const parts = path.split('.');
      let value = data;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }
      if (typeof value !== 'undefined') {
        setValue(path, value);
      }
    });
  }

  function hasMeaningfulData(payload) {
    return [
      payload.personal.firstName,
      payload.personal.lastName,
      payload.contact.email,
      payload.contact.phone,
      payload.reason.code,
      payload.mailingAddress.line1,
      payload.foreignAddress.line1,
    ].some(Boolean);
  }

  function clearInvalidStates() {
    form.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
  }

  function markInvalid(name) {
    const nodes = getNodes(name);
    nodes.forEach((node) => {
      const card = node.closest('.field-card, .reason-card, .check-card, .check-inline');
      if (card) {
        card.classList.add('is-invalid');
      }
    });
  }

  function conditionalFields(payload) {
    const extras = [];
    if (['a', 'f'].includes(payload.reason.code)) {
      extras.push('reason.treatyCountry', 'reason.treatyArticle');
    }
    if (payload.reason.code === 'f') {
      extras.push('reason.collegeOrCompanyName', 'reason.collegeOrCompanyCityState', 'reason.lengthOfStay');
    }
    if (['d', 'e'].includes(payload.reason.code)) {
      extras.push('reason.relationshipToCitizen', 'reason.sponsorName', 'reason.sponsorTin');
    }
    if (payload.reason.code === 'g') {
      extras.push('reason.visaHolderName', 'reason.visaHolderRelationship');
    }
    if (payload.reason.code === 'h') {
      extras.push('reason.otherDescription');
    }
    if (payload.applicationType === 'renewal') {
      extras.push('foreignStatus.previousItinReceived');
    }
    if (payload.applicationType === 'renewal' || payload.foreignStatus.previousItinReceived === 'yes') {
      extras.push('foreignStatus.priorIssuedName');
    }
    return extras;
  }

  function validateField(name, payload) {
    const value = name === 'supportingDocuments.selected' ? payload.supportingDocuments.selected : getValue(name);

    if (name === 'supportingDocuments.selected') {
      return Array.isArray(value) && value.length > 0;
    }

    if (
      name === 'acknowledgements.privateService' ||
      name === 'acknowledgements.irsFeeNotice' ||
      name === 'acknowledgements.accuracy'
    ) {
      return Boolean(value);
    }

    if (name === 'reason.code') {
      return Boolean(value);
    }

    if (name === 'foreignStatus.previousItinReceived' && payload.applicationType === 'renewal') {
      return value === 'yes';
    }

    if (name === 'foreignStatus.priorIssuedName') {
      if (payload.applicationType !== 'renewal' && payload.foreignStatus.previousItinReceived !== 'yes') {
        return true;
      }
      return Boolean(value);
    }

    return Boolean(value);
  }

  function validateStep(index) {
    clearInvalidStates();
    const payload = collectPayload();
    const names = new Set(stepRules[index] || []);

    if (index === 1 && (payload.applicationType === 'renewal' || payload.foreignStatus.previousItinReceived === 'yes')) {
      names.add('foreignStatus.priorIssuedName');
    }

    if (index === 2) {
      conditionalFields(payload).forEach((name) => {
        if (name.startsWith('reason.')) names.add(name);
      });
    }

    const invalid = Array.from(names).filter((name) => !validateField(name, payload));
    invalid.forEach(markInvalid);

    if (invalid.length) {
      setStatus('Please complete the highlighted fields before continuing.', true);
      const firstNode = getNodes(invalid[0])[0];
      if (firstNode && typeof firstNode.focus === 'function') {
        firstNode.focus();
      }
      return false;
    }

    setStatus('');
    return true;
  }

  function updateReasonGroups() {
    const reason = getValue('reason.code');
    form.querySelectorAll('[data-reason-group]').forEach((group) => {
      const codes = String(group.getAttribute('data-reason-group') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const isVisible = codes.includes(reason);
      group.classList.toggle('is-hidden', !isVisible);
      group.querySelectorAll('input, textarea, select').forEach((input) => {
        input.disabled = !isVisible;
      });
    });
  }

  function updateProgress() {
    const progress = steps.length > 1
      ? Math.round((currentStep / (steps.length - 1)) * 100)
      : 100;
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    if (progressPercent) {
      progressPercent.textContent = `${progress}% Complete`;
    }
    if (progressCount) {
      progressCount.textContent = `${currentStep + 1} of ${steps.length}`;
    }
    progressLabels.forEach((label, index) => {
      label.classList.toggle('is-active', index === currentStep);
    });
    steps.forEach((step, index) => {
      step.classList.toggle('is-active', index === currentStep);
    });
    prevButton.classList.toggle('is-hidden', currentStep === 0);
    nextButton.classList.toggle('is-hidden', currentStep === steps.length - 1);
    submitButton.classList.toggle('is-hidden', currentStep !== steps.length - 1);
  }

  async function saveDraft(showMessage) {
    const payload = collectPayload();
    if (!hasMeaningfulData(payload)) return;

    try {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Draft save failed.');

      draftId = result.draftId;
      form.elements.namedItem('draftId').value = draftId;
      const draftRecord = {
        draftId,
        payload: {
          ...payload,
          draftId,
        },
        savedAt: Date.now(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(draftRecord));
      setStatus(showMessage ? `Draft saved. Resume later: ${result.resumeUrl}` : 'Draft saved.');
    } catch (error) {
      setStatus('Draft could not be saved right now.', true);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveDraft(false);
    }, 700);
  }

  async function submitApplication(event) {
    event.preventDefault();

    clearInvalidStates();
    for (let index = 0; index < steps.length; index += 1) {
      currentStep = index;
      updateProgress();
      if (!validateStep(index)) {
        return;
      }
    }

    const payload = collectPayload();
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    setStatus('Submitting your application...');

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        (result.errors || []).forEach((item) => markInvalid(item.field));
        throw new Error(result.message || 'Submission failed.');
      }

      window.localStorage.removeItem(storageKey);
      window.location.href = result.redirectUrl;
    } catch (error) {
      setStatus(error.message || 'Submission failed. Please review the form and try again.', true);
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Application';
    }
  }

  nextButton.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    currentStep = Math.min(currentStep + 1, steps.length - 1);
    updateProgress();
  });

  prevButton.addEventListener('click', () => {
    currentStep = Math.max(currentStep - 1, 0);
    updateProgress();
    setStatus('');
  });

  saveButton.addEventListener('click', () => {
    saveDraft(true);
  });

  form.addEventListener('submit', submitApplication);
  form.addEventListener('input', () => {
    clearInvalidStates();
    updateReasonGroups();
    scheduleSave();
  });
  form.addEventListener('change', () => {
    updateReasonGroups();
    scheduleSave();
  });

  const serverDraft = config.initialDraft || null;
  let localDraft = null;

  try {
    localDraft = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
  } catch (error) {
    localDraft = null;
  }

  if (serverDraft) {
    populateFromData(serverDraft);
    setStatus('Saved draft restored.');
  } else if (localDraft && localDraft.payload) {
    populateFromData(localDraft.payload);
    draftId = localDraft.draftId || draftId;
    setStatus('Local draft restored.');
  }

  updateReasonGroups();
  updateProgress();
})();
