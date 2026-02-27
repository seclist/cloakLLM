/**
 * Single source of truth for PII type keys and display labels.
 * Keys must match the pattern labels used in cloak.js.
 * category: Contact | Financial | Identifiers | Other
 */
var PII_TYPES = [
    { key: 'EMAIL', label: 'Email', category: 'Contact' },
    { key: 'PHONE', label: 'Phone numbers', category: 'Contact' },
    { key: 'CREDIT_CARD', label: 'Credit cards', category: 'Financial' },
    { key: 'SSN', label: 'Social Security (SSN)', category: 'Identifiers' },
    { key: 'IP_ADDR', label: 'IP addresses', category: 'Other' },
    { key: 'API_KEY', label: 'API keys', category: 'Other' },
    { key: 'MAC_ADDR', label: 'MAC addresses', category: 'Other' },
    { key: 'IBAN', label: 'IBAN', category: 'Financial' },
    { key: 'BANK_ACCOUNT', label: 'Routing / account numbers', category: 'Financial' },
    { key: 'EIN', label: 'EIN (tax ID)', category: 'Identifiers' },
    { key: 'NINO', label: 'UK NINO', category: 'Identifiers' },
    { key: 'UUID', label: 'UUIDs', category: 'Other' },
    { key: 'PASSPORT', label: 'Passport numbers', category: 'Identifiers' },
    { key: 'DRIVER_LICENSE', label: "Driver's license", category: 'Identifiers' },
    { key: 'DATE_OF_BIRTH', label: 'Date of birth', category: 'Identifiers' },
    { key: 'UK_POSTCODE', label: 'UK postcodes', category: 'Other' }
];
