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

  function initLandingTypeAccordion() {
    const rows = Array.from(document.querySelectorAll('.landing-type-row'));
    if (!rows.length) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isSwitching = false;

    function getContent(row) {
      return row.querySelector('p');
    }

    function cleanupContent(content) {
      content.style.height = '';
      content.style.opacity = '';
      content.style.overflow = '';
    }

    function animateContent(content, keyframes) {
      const animation = content.animate(keyframes, {
        duration: 220,
        easing: 'ease',
        fill: 'forwards',
      });

      return new Promise((resolve) => {
        animation.addEventListener('finish', resolve, { once: true });
        animation.addEventListener('cancel', resolve, { once: true });
      });
    }

    async function expandRow(row) {
      const content = getContent(row);
      if (!content) {
        row.open = true;
        return;
      }

      if (prefersReducedMotion) {
        row.open = true;
        return;
      }

      row.open = true;
      content.style.overflow = 'hidden';
      content.style.height = '0px';
      content.style.opacity = '0';

      const targetHeight = `${content.scrollHeight}px`;
      await animateContent(content, [
        { height: '0px', opacity: 0 },
        { height: targetHeight, opacity: 1 },
      ]);

      cleanupContent(content);
    }

    async function collapseRow(row) {
      if (!row.open) return;

      const content = getContent(row);
      if (!content) {
        row.open = false;
        return;
      }

      if (prefersReducedMotion) {
        row.open = false;
        return;
      }

      const startHeight = `${content.offsetHeight}px`;
      content.style.overflow = 'hidden';
      content.style.height = startHeight;
      content.style.opacity = '1';

      await animateContent(content, [
        { height: startHeight, opacity: 1 },
        { height: '0px', opacity: 0 },
      ]);

      row.open = false;
      cleanupContent(content);
    }

    rows.forEach((row) => {
      const summary = row.querySelector('summary');
      if (!summary) return;

      summary.addEventListener('click', async (event) => {
        event.preventDefault();

        if (isSwitching) return;
        isSwitching = true;

        try {
          const openRow = rows.find((item) => item !== row && item.open);

          if (row.open) {
            await collapseRow(row);
            return;
          }

          if (openRow) {
            await collapseRow(openRow);
          }

          await expandRow(row);
        } finally {
          isSwitching = false;
        }
      });
    });
  }

  initLandingTypeAccordion();

  function initServiceRequestForm() {
    const serviceForm = document.querySelector('[data-service-request-form]');
    if (!serviceForm) return;

    const steps = Array.from(serviceForm.querySelectorAll('.form-step'));
    const progressFill = serviceForm.querySelector('[data-sr-progress-fill]');
    const progressPercent = serviceForm.querySelector('[data-sr-progress-percent]');
    const progressCount = serviceForm.querySelector('[data-sr-progress-count]');
    const nextButton = serviceForm.querySelector('[data-sr-next-step]');
    const prevButton = serviceForm.querySelector('[data-sr-prev-step]');
    const submitButton = serviceForm.querySelector('[data-sr-submit-form]');
    let currentStep = 0;

    const stepRules = [
      ['serviceType'],
      ['firstName', 'lastName', 'email', 'phone'],
      ['privateService'],
    ];

    function getNodes(name) {
      const field = serviceForm.elements.namedItem(name);
      if (!field) return [];
      if (typeof field.length === 'number' && !field.tagName) {
        return Array.from(field);
      }
      return [field];
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
        return Boolean(first.checked);
      }

      return String(first.value || '').trim();
    }

    function clearInvalidStates() {
      serviceForm.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
    }

    function markInvalid(name) {
      const nodes = getNodes(name);
      nodes.forEach((node) => {
        const card = node.closest('.field-card, .service-request-option, .check-inline');
        if (card) {
          card.classList.add('is-invalid');
        }
      });
    }

    function validateStep(index) {
      clearInvalidStates();
      const invalid = stepRules[index].filter((name) => !getValue(name));
      invalid.forEach(markInvalid);

      if (invalid.length) {
        const firstNode = getNodes(invalid[0])[0];
        if (firstNode && typeof firstNode.focus === 'function') {
          firstNode.focus();
        }
        return false;
      }

      return true;
    }

    function updateProgress() {
      const progress = steps.length > 1
        ? Math.round((currentStep / (steps.length - 1)) * 100)
        : 100;

      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressPercent) progressPercent.textContent = `${progress}% Complete`;
      if (progressCount) progressCount.textContent = `${currentStep + 1} of ${steps.length}`;

      steps.forEach((step, index) => {
        step.classList.toggle('is-active', index === currentStep);
      });

      prevButton.classList.toggle('is-hidden', currentStep === 0);
      nextButton.classList.toggle('is-hidden', currentStep === steps.length - 1);
      submitButton.classList.toggle('is-hidden', currentStep !== steps.length - 1);
    }

    nextButton.addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      currentStep = Math.min(currentStep + 1, steps.length - 1);
      updateProgress();
    });

    prevButton.addEventListener('click', () => {
      currentStep = Math.max(currentStep - 1, 0);
      clearInvalidStates();
      updateProgress();
    });

    serviceForm.addEventListener('input', clearInvalidStates);
    serviceForm.addEventListener('change', clearInvalidStates);
    serviceForm.addEventListener('submit', (event) => {
      clearInvalidStates();
      for (let index = 0; index < steps.length; index += 1) {
        currentStep = index;
        updateProgress();
        if (!validateStep(index)) {
          event.preventDefault();
          return;
        }
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
    });

    updateProgress();
  }

  initServiceRequestForm();

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
      'reason.code',
      'foreignStatus.identificationType',
      'foreignStatus.identificationIssuer',
      'foreignStatus.identificationNumber',
      'foreignStatus.identificationExpiry',
    ],
    [
      'mailingAddress.line1',
      'mailingAddress.city',
      'mailingAddress.stateProvince',
      'mailingAddress.postalCode',
      'mailingAddress.country',
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
    if (payload.applicationType === 'renewal' || payload.foreignStatus.previousItinReceived === 'yes') {
      extras.push('foreignStatus.priorItin', 'foreignStatus.priorIrsn', 'foreignStatus.priorIssuedName');
    }
    return extras;
  }

  function validateField(name, payload) {
    const value = getValue(name);

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

    if (name === 'foreignStatus.priorItin' || name === 'foreignStatus.priorIrsn') {
      if (payload.applicationType !== 'renewal' && payload.foreignStatus.previousItinReceived !== 'yes') {
        return true;
      }
      return Boolean(payload.foreignStatus.priorItin || payload.foreignStatus.priorIrsn);
    }

    return Boolean(value);
  }

  function validateStep(index) {
    clearInvalidStates();
    const payload = collectPayload();
    const names = new Set(stepRules[index] || []);

    if (index === 1) {
      conditionalFields(payload).forEach((name) => {
        names.add(name);
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

  function updatePriorItinGroups() {
    const payload = collectPayload();
    const isVisible = payload.applicationType === 'renewal' || payload.foreignStatus.previousItinReceived === 'yes';
    form.querySelectorAll('[data-prior-itin-group]').forEach((group) => {
      group.classList.toggle('is-hidden', !isVisible);
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
      submitButton.textContent = 'Submit';
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
    updatePriorItinGroups();
    scheduleSave();
  });
  form.addEventListener('change', () => {
    updateReasonGroups();
    updatePriorItinGroups();
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
  updatePriorItinGroups();
  updateProgress();
})();
