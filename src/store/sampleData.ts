import { SopProject, ProjectTheme, BeautifySettings, DEFAULT_COVER_PAGE_SETTINGS } from '../types/sop';

export const DEFAULT_BEAUTIFY_SETTINGS: BeautifySettings = {
  enabled: true,
  padding: 24,
  backgroundType: 'gradient',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  shadowBlur: 20
};

export const DEFAULT_THEME: ProjectTheme = {
  primaryColor: '#18181b', // neutral zinc-900
  accentColor: '#2563eb',  // royal blue
  fontFamily: 'system-ui, -apple-system, sans-serif',
  beautifySettings: DEFAULT_BEAUTIFY_SETTINGS
};

export const SAMSUNG_THEME: ProjectTheme = {
  primaryColor: '#1428A0', // Samsung Blue
  accentColor: '#0077C8',  // Sky Blue
  fontFamily: 'system-ui, -apple-system, sans-serif',
  beautifySettings: {
    enabled: true,
    padding: 24,
    backgroundType: 'solid',
    backgroundColor: '#F2F4F7', // Cloud
    borderRadius: 8,
    shadowBlur: 18,
  },
};

// Vector SVG mockups for sample project
const STEP_1_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" fill="none"><rect width="960" height="540" rx="8" fill="%23ffffff"/><rect width="960" height="40" fill="%23f8fafc" stroke="%23e2e8f0" stroke-width="1"/><circle cx="20" cy="20" r="5" fill="%23ef4444"/><circle cx="36" cy="20" r="5" fill="%23f59e0b"/><circle cx="52" cy="20" r="5" fill="%2310b981"/><rect x="100" y="8" width="340" height="24" rx="5" fill="%23ffffff" stroke="%23cbd5e1"/><text x="116" y="24" font-family="system-ui, sans-serif" font-size="11" fill="%2364748b">https://merchant.acme.corp/admin/transactions</text><rect x="0" y="40" width="180" height="500" fill="%23f8fafc" stroke="%23e2e8f0"/><text x="20" y="74" font-family="system-ui, sans-serif" font-weight="700" font-size="13" fill="%230f172a">MerchantOS</text><rect x="10" y="92" width="160" height="30" rx="5" fill="%23e2e8f0"/><text x="24" y="112" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="%230f172a">Transactions</text><text x="24" y="146" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Customers</text><text x="24" y="180" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Disputes</text><text x="24" y="214" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Reports</text><text x="210" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="18" fill="%230f172a">Search &amp; Filter Transactions</text><rect x="210" y="100" width="380" height="34" rx="6" fill="%23ffffff" stroke="%233b82f6" stroke-width="2"/><text x="226" y="122" font-family="system-ui, sans-serif" font-size="13" fill="%230f172a">ORD-89421</text><rect x="600" y="100" width="80" height="34" rx="6" fill="%232563eb"/><text x="622" y="122" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="%23ffffff">Search</text><rect x="210" y="160" width="710" height="36" rx="6" fill="%23f1f5f9"/><text x="226" y="183" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23475569">ID</text><text x="340" y="183" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23475569">Customer</text><text x="530" y="183" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23475569">Amount</text><text x="680" y="183" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23475569">Status</text><rect x="210" y="206" width="710" height="50" rx="6" fill="%23eff6ff" stroke="%2393c5fd" stroke-width="1.5"/><text x="226" y="236" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="%231d4ed8">ORD-89421</text><text x="340" y="236" font-family="system-ui, sans-serif" font-size="13" fill="%230f172a">jordan.smith@workplace.com</text><text x="530" y="236" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="%230f172a">$74.50 USD</text><rect x="680" y="222" width="60" height="22" rx="11" fill="%23dcfce7"/><text x="694" y="237" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="%23166534">Paid</text></svg>`;

const STEP_2_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" fill="none"><rect width="960" height="540" rx="8" fill="%23ffffff"/><rect width="960" height="40" fill="%23f8fafc" stroke="%23e2e8f0" stroke-width="1"/><circle cx="20" cy="20" r="5" fill="%23ef4444"/><circle cx="36" cy="20" r="5" fill="%23f59e0b"/><circle cx="52" cy="20" r="5" fill="%2310b981"/><rect x="100" y="8" width="340" height="24" rx="5" fill="%23ffffff" stroke="%23cbd5e1"/><text x="116" y="24" font-family="system-ui, sans-serif" font-size="11" fill="%2364748b">https://merchant.acme.corp/admin/transactions/ORD-89421</text><rect x="40" y="60" width="880" height="440" rx="8" fill="%23ffffff" stroke="%23e2e8f0"/><text x="70" y="96" font-family="system-ui, sans-serif" font-weight="700" font-size="18" fill="%230f172a">Transaction Details — ORD-89421</text><rect x="70" y="116" width="120" height="24" rx="12" fill="%23dbeafe"/><text x="86" y="132" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="%231e40af">Eligible for Refund</text><rect x="70" y="160" width="500" height="180" rx="6" fill="%23f8fafc" stroke="%23e2e8f0"/><text x="90" y="190" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Billing Name:</text><text x="210" y="190" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="%230f172a">Jordan Smith</text><text x="90" y="224" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Payment Method:</text><text x="210" y="224" font-family="system-ui, sans-serif" font-size="12" fill="%230f172a">Visa ending in 4242</text><text x="90" y="258" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Original Charge Date:</text><text x="210" y="258" font-family="system-ui, sans-serif" font-size="12" fill="%230f172a">14 days ago (Within 30-day window)</text><text x="90" y="292" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">Item Purchased:</text><text x="210" y="292" font-family="system-ui, sans-serif" font-size="12" fill="%230f172a">Cloud Pro Annual Tier</text><rect x="610" y="160" width="280" height="180" rx="6" fill="%23f8fafc" stroke="%23e2e8f0"/><text x="630" y="190" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="%230f172a">Ops Actions</text><rect x="630" y="210" width="240" height="36" rx="6" fill="%23dc2626"/><text x="710" y="233" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="%23ffffff">Refund Order</text><rect x="630" y="256" width="240" height="36" rx="6" fill="%23ffffff" stroke="%23cbd5e1"/><text x="710" y="279" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="%23334155">Resend Receipt</text></svg>`;

const STEP_3_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" fill="none"><rect width="960" height="540" fill="%230f172a" fill-opacity="0.4"/><rect x="260" y="70" width="440" height="400" rx="10" fill="%23ffffff" stroke="%23e2e8f0" stroke-width="1.5"/><text x="290" y="112" font-family="system-ui, sans-serif" font-weight="700" font-size="17" fill="%230f172a">Process Full Refund</text><text x="290" y="134" font-family="system-ui, sans-serif" font-size="12" fill="%2364748b">This action returns $74.50 to Visa **** 4242</text><text x="290" y="174" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23334155">Refund Amount ($)</text><rect x="290" y="184" width="380" height="36" rx="6" fill="%23f8fafc" stroke="%23cbd5e1"/><text x="306" y="207" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="%230f172a">$74.50</text><text x="290" y="246" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23334155">Reason for Refund</text><rect x="290" y="256" width="380" height="36" rx="6" fill="%23f8fafc" stroke="%23cbd5e1"/><text x="306" y="279" font-family="system-ui, sans-serif" font-size="13" fill="%230f172a">Customer Dissatisfaction / Request</text><text x="290" y="318" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="%23334155">Internal Reference / Ticket ID</text><rect x="290" y="328" width="380" height="36" rx="6" fill="%23f8fafc" stroke="%23cbd5e1"/><text x="306" y="351" font-family="system-ui, sans-serif" font-size="13" fill="%230f172a">ZD-94028</text><rect x="290" y="394" width="180" height="38" rx="6" fill="%23f1f5f9"/><text x="350" y="418" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="%23475569">Cancel</text><rect x="490" y="394" width="180" height="38" rx="6" fill="%23dc2626"/><text x="532" y="418" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="%23ffffff">Confirm Refund</text></svg>`;

export const SAMPLE_PROJECT: SopProject = {
  id: 'proj-sample-refund-process',
  name: 'Customer Refund Process',
  description: 'Standard operating procedure for issuing full or partial payment refunds in the merchant portal.',
  author: 'Support Operations',
  version: '1.2.0',
  tags: ['Support', 'Finance', 'Billing'],
  status: 'published',
  createdAt: '2026-10-15T09:00:00.000Z',
  updatedAt: '2026-10-16T14:30:00.000Z',
  theme: DEFAULT_THEME,
  coverPage: {
    ...DEFAULT_COVER_PAGE_SETTINGS,
    title: 'Customer Refund Process',
    subtitle: 'Standard operating procedure for issuing full or partial payment refunds in the merchant portal.',
    organization: 'Payment Operations',
    author: 'Support Operations'
  },
  steps: [
    {
      id: 'step-1-search-trans',
      order: 1,
      type: 'screenshot',
      title: 'Locate Order in PaymentOps Portal',
      description: 'Navigate to the merchant dashboard and use the search bar to locate the customer transaction using their Order ID or verified customer email address.',
      callout: {
        type: 'tip',
        text: 'Always double-check that the email matches the Zendesk ticket requester before proceeding.'
      },
      subSteps: [
        { badgeNumber: 1, title: 'Open Transactions Tab', note: 'Located in the left navigation sidebar' },
        { badgeNumber: 2, title: 'Enter Order ID', note: 'Paste the ORD-XXXXX string into the search input' }
      ],
      image: {
        originalImagePath: STEP_1_SVG,
        dimensions: { width: 960, height: 540 },
        annotations: [
          {
            id: 'anno-1',
            type: 'badge',
            x: 230,
            y: 118,
            badgeNumber: 1,
            fillColor: '#2563eb'
          },
          {
            id: 'anno-2',
            type: 'badge',
            x: 640,
            y: 118,
            badgeNumber: 2,
            fillColor: '#2563eb'
          }
        ]
      }
    },
    {
      id: 'step-2-verify-details',
      order: 2,
      type: 'screenshot',
      title: 'Verify Refund Eligibility and Window',
      description: 'Confirm that the original charge took place within the allowable 30-day refund window and that no previous chargebacks or disputes have been filed against this transaction.',
      callout: {
        type: 'warning',
        text: 'Do not initiate a refund if the charge has an open dispute or active chargeback status.'
      },
      image: {
        originalImagePath: STEP_2_SVG,
        dimensions: { width: 960, height: 540 },
        annotations: [
          {
            id: 'anno-3',
            type: 'badge',
            x: 750,
            y: 228,
            badgeNumber: 1,
            fillColor: '#dc2626'
          }
        ]
      }
    },
    {
      id: 'step-3-confirm-action',
      order: 3,
      type: 'screenshot',
      title: 'Execute and Confirm the Refund',
      description: 'Click "Refund Order", select the appropriate cancellation reason from the dropdown, attach the internal Zendesk ticket reference ID, and click "Confirm Refund".',
      callout: {
        type: 'info',
        text: 'Funds typically return to the customer bank card statement within 3 to 5 business days.'
      },
      image: {
        originalImagePath: STEP_3_SVG,
        dimensions: { width: 960, height: 540 },
        annotations: [
          {
            id: 'anno-4',
            type: 'badge',
            x: 580,
            y: 412,
            badgeNumber: 1,
            fillColor: '#2563eb'
          }
        ]
      }
    },
    {
      id: 'step-4-close-ticket',
      order: 4,
      type: 'text_only',
      title: 'Notify Customer & Update Zendesk Ticket',
      description: `### Post-Refund Communication Protocol\n\n1. **Copy the Refund Reference ID** generated by PaymentOps.\n2. In the corresponding Zendesk ticket, apply the **Macro: "Billing - Refund Completed"**.\n3. Insert the exact settlement timeframe: *3 to 5 business days*.\n4. Change ticket status to **Solved** and notify the customer.\n\n> Note: For high-tier enterprise accounts, also CC the dedicated Customer Success Manager.`,
      callout: {
        type: 'tip',
        text: 'Ensure the Zendesk internal note captures the PaymentOps audit log ID for finance compliance.'
      }
    }
  ]
};
