import 'dotenv/config';

const clientId = process.env.FEDEX_ONE_RATE_USER_KEY;
const clientSecret = process.env.FEDEX_ONE_RATE_PASSWORD;
const accountNumber = process.env.FEDEX_ONE_RATE_ACCOUNT_NUMBER;

console.log('CLIENT_ID:', clientId ? clientId.slice(0,8) + '...' + clientId.slice(-4) : 'NOT SET');
console.log('ACCOUNT:', accountNumber);

// Get token
const tokenRes = await fetch('https://apis.fedex.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
});
const tokenData = await tokenRes.json();
const token = tokenData.access_token;
console.log('Token scope:', tokenData.scope);
console.log('Token obtained:', !!token);

// Try ship endpoint
const res = await fetch('https://apis.fedex.com/ship/v1/shipments', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'X-locale': 'en_US' },
  body: JSON.stringify({
    labelResponseOptions: 'LABEL',
    requestedShipment: {
      shipper: {
        contact: { personName: 'Test Shipper', phoneNumber: '6145550000' },
        address: { streetLines: ['1 Main St'], city: 'Columbus', stateOrProvinceCode: 'OH', postalCode: '43215', countryCode: 'US' }
      },
      recipients: [{
        contact: { personName: 'Test Recipient', phoneNumber: '8175550000' },
        address: { streetLines: ['1 Main St'], city: 'Arlington', stateOrProvinceCode: 'TX', postalCode: '76016', countryCode: 'US', residential: false }
      }],
      shipDatestamp: new Date().toISOString().split('T')[0],
      serviceType: 'FEDEX_2_DAY',
      packagingType: 'FEDEX_SMALL_BOX',
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: { responsibleParty: { accountNumber: { value: accountNumber } } }
      },
      labelSpecification: { labelFormatType: 'COMMON2D', imageType: 'ZPLII', labelStockType: 'PAPER_4X6' },
      requestedPackageLineItems: [{
        weight: { units: 'LB', value: 0.5 },
        dimensions: { length: 10, width: 7, height: 2, units: 'IN' }
      }]
    },
    accountNumber: { value: accountNumber }
  })
});

const data = await res.json();
console.log('SHIP STATUS:', res.status);
console.log('SHIP RESPONSE:', JSON.stringify(data, null, 2).slice(0, 3000));
