/**
 * FedEx Rate Fetcher — Legacy Web Services (SOAP)
 *
 * Uses FedEx Web Services RateService WSDL with User Key + Password credentials.
 * Env:
 *   FEDEX_USER_KEY     — e.g. "E7EKpyMIQKJh4ZF0"
 *   FEDEX_PASSWORD     — e.g. "5WkIeSVTo5c6VWE8J7yCyj8Ev"
 *   FEDEX_ACCOUNT_NUMBER — optional, from FedEx account (for negotiated rates)
 *   FEDEX_METER_NUMBER   — optional, from FedEx account (for negotiated rates)
 *
 * API: https://www.fedex.com/en-us/developer/web-services.html
 * Endpoint: https://ws.fedex.com:443/web-services
 */

import type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";

const FEDEX_WSDL_ENDPOINT = "https://ws.fedex.com:443/web-services";

// FedEx service types → human labels + typical transit days
const FEDEX_SERVICES: Record<string, { label: string; transitDays: number }> = {
  "FEDEX_GROUND": { label: "FedEx Ground", transitDays: 5 },
  "GROUND_HOME_DELIVERY": { label: "FedEx Home Delivery", transitDays: 5 },
  "FEDEX_EXPRESS_SAVER": { label: "FedEx Express Saver", transitDays: 3 },
  "FEDEX_2_DAY": { label: "FedEx 2Day", transitDays: 2 },
  "FEDEX_2_DAY_AM": { label: "FedEx 2Day A.M.", transitDays: 2 },
  "STANDARD_OVERNIGHT": { label: "FedEx Standard Overnight", transitDays: 1 },
  "PRIORITY_OVERNIGHT": { label: "FedEx Priority Overnight", transitDays: 1 },
  "FIRST_OVERNIGHT": { label: "FedEx First Overnight", transitDays: 1 },
  "INTERNATIONAL_ECONOMY": { label: "FedEx International Economy", transitDays: 5 },
  "INTERNATIONAL_PRIORITY": { label: "FedEx International Priority", transitDays: 2 },
  "FEDEX_INTERNATIONAL_GROUND": { label: "FedEx International Ground", transitDays: 5 },
};

function buildFedExSoapEnvelope(input: CarrierRateInput, userKey: string, password: string, accountNumber: string, meterNumber: string): string {
  const weightLbs = Math.max(input.weightLbs, 0.1).toFixed(1);
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:v28="http://fedex.com/ws/rate/v28">
  <soapenv:Header/>
  <soapenv:Body>
    <v28:RateRequest>
      <v28:WebAuthenticationDetail>
        <v28:UserCredential>
          <v28:Key>${userKey}</v28:Key>
          <v28:Password>${password}</v28:Password>
        </v28:UserCredential>
      </v28:WebAuthenticationDetail>
      <v28:ClientDetail>
        <v28:AccountNumber>${accountNumber}</v28:AccountNumber>
        <v28:MeterNumber>${meterNumber}</v28:MeterNumber>
      </v28:ClientDetail>
      <v28:TransactionDetail>
        <v28:CustomerTransactionId>GD Genius Rate Wizard</v28:CustomerTransactionId>
      </v28:TransactionDetail>
      <v28:Version>
        <v28:ServiceId>crs</v28:ServiceId>
        <v28:Major>28</v28:Major>
        <v28:Intermediate>0</v28:Intermediate>
        <v28:Minor>0</v28:Minor>
      </v28:Version>
      <v28:ReturnTransitAndCommit>true</v28:ReturnTransitAndCommit>
      <v28:RequestedShipment>
        <v28:ShipTimestamp>${now}</v28:ShipTimestamp>
        <v28:DropoffType>REGULAR_PICKUP</v28:DropoffType>
        <v28:PackagingType>YOUR_PACKAGING</v28:PackagingType>
        <v28:Shipper>
          <v28:AccountNumber>${accountNumber}</v28:AccountNumber>
          <v28:Address>
            <v28:PostalCode>${input.originPostal}</v28:PostalCode>
            <v28:CountryCode>${input.originCountry || "US"}</v28:CountryCode>
            <v28:StateOrProvinceCode>${input.originState}</v28:StateOrProvinceCode>
            <v28:City>${input.originCity}</v28:City>
          </v28:Address>
        </v28:Shipper>
        <v28:Recipient>
          <v28:Address>
            <v28:PostalCode>${input.destPostal}</v28:PostalCode>
            <v28:CountryCode>${input.destCountry || "US"}</v28:CountryCode>
            <v28:StateOrProvinceCode>${input.destState ?? ""}</v28:StateOrProvinceCode>
            <v28:City>${input.destCity ?? ""}</v28:City>
            <v28:Residential>${input.isResidential ? "true" : "false"}</v28:Residential>
          </v28:Address>
        </v28:Recipient>
        <v28:ShippingChargesPayment>
          <v28:PaymentType>SENDER</v28:PaymentType>
          <v28:Payor>
            <v28:ResponsibleParty>
              <v28:AccountNumber>${accountNumber}</v28:AccountNumber>
            </v28:ResponsibleParty>
          </v28:Payor>
        </v28:ShippingChargesPayment>
        <v28:RateRequestTypes>LIST</v28:RateRequestTypes>
        <v28:RateRequestTypes>ACCOUNT</v28:RateRequestTypes>
        <v28:PackageCount>1</v28:PackageCount>
        <v28:RequestedPackageLineItems>
          <v28:SequenceNumber>1</v28:SequenceNumber>
          <v28:GroupPackageCount>1</v28:GroupPackageCount>
          <v28:Weight>
            <v28:Units>LB</v28:Units>
            <v28:Value>${weightLbs}</v28:Value>
          </v28:Weight>
          <v28:Dimensions>
            <v28:Length>${Math.ceil(input.lengthIn)}</v28:Length>
            <v28:Width>${Math.ceil(input.widthIn)}</v28:Width>
            <v28:Height>${Math.ceil(input.heightIn)}</v28:Height>
            <v28:Units>IN</v28:Units>
          </v28:Dimensions>
        </v28:RequestedPackageLineItems>
      </v28:RequestedShipment>
    </v28:RateRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractXmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<`, "i"));
  return match ? match[1].trim() : null;
}

function extractAllXmlBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = new RegExp(`<(?:[^:>]+:)?${tag}[\\s>]`, "gi");
  const closeTag = new RegExp(`</(?:[^:>]+:)?${tag}>`, "gi");
  let match;
  openTag.lastIndex = 0;
  while ((match = openTag.exec(xml)) !== null) {
    const start = match.index;
    closeTag.lastIndex = start;
    const endMatch = closeTag.exec(xml);
    if (endMatch) {
      blocks.push(xml.slice(start, endMatch.index + endMatch[0].length));
    }
  }
  return blocks;
}

export async function fetchFedExRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const userKey = process.env.FEDEX_USER_KEY;
  const password = process.env.FEDEX_PASSWORD;

  if (!userKey || !password) {
    console.warn("[FedEx] FEDEX_USER_KEY or FEDEX_PASSWORD not configured — skipping FedEx rates");
    return [];
  }

  // Use account/meter from env or fall back to empty (list rates only)
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER ?? "";
  const meterNumber = process.env.FEDEX_METER_NUMBER ?? "";

  const soapBody = buildFedExSoapEnvelope(input, userKey, password, accountNumber, meterNumber);

  try {
    const resp = await fetch(FEDEX_WSDL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "",
      },
      body: soapBody,
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[FedEx] SOAP error ${resp.status}: ${errText.slice(0, 300)}`);
      return [];
    }

    const xml = await resp.text();

    // Check for SOAP fault
    if (xml.includes("<faultstring>") || xml.includes(":faultstring>")) {
      const fault = extractXmlValue(xml, "faultstring") ?? "Unknown SOAP fault";
      console.error(`[FedEx] SOAP fault: ${fault}`);
      return [];
    }

    // Check for FedEx error
    if (xml.includes("ERROR") && xml.includes("Severity>ERROR")) {
      const msg = extractXmlValue(xml, "Message") ?? "Unknown FedEx error";
      console.error(`[FedEx] API error: ${msg}`);
      return [];
    }

    // Extract RatedShipmentDetail blocks
    const ratedShipments = extractAllXmlBlocks(xml, "RatedShipmentDetail");
    const rates: CarrierRate[] = [];

    for (const block of ratedShipments) {
      // Only use ACCOUNT or LIST rate type (skip PAYOR_LIST duplicates)
      const rateType = extractXmlValue(block, "RateType");
      if (rateType && !["PAYOR_ACCOUNT_PACKAGE", "PAYOR_LIST_PACKAGE", "ACCOUNT", "LIST"].some(t => rateType.includes(t))) {
        continue;
      }

      const serviceType = extractXmlValue(xml, "ServiceType") ?? extractXmlValue(block, "ServiceType");
      if (!serviceType) continue;

      const serviceInfo = FEDEX_SERVICES[serviceType];
      if (!serviceInfo) continue;

      const totalNetCharge = extractXmlValue(block, "TotalNetCharge") ??
        extractXmlValue(block, "TotalNetFedExCharge");
      if (!totalNetCharge) continue;

      const totalCost = parseFloat(totalNetCharge);
      if (!isFinite(totalCost) || totalCost <= 0) continue;

      const currency = extractXmlValue(block, "Currency") ?? "USD";

      // Transit days
      const transitDaysStr = extractXmlValue(block, "BusinessDaysInTransit") ??
        extractXmlValue(block, "DaysInTransit");
      const transitDays = transitDaysStr ? parseInt(transitDaysStr, 10) : serviceInfo.transitDays;

      // Surcharges
      const surchargeBlocks = extractAllXmlBlocks(block, "Surcharge");
      const surcharges = surchargeBlocks.map((sb) => ({
        label: extractXmlValue(sb, "Description") ?? extractXmlValue(sb, "SurchargeType") ?? "Surcharge",
        amount: parseFloat(extractXmlValue(sb, "Amount") ?? "0"),
      })).filter((s) => s.amount > 0);

      // Deduplicate by service type (prefer ACCOUNT rate)
      const existingIdx = rates.findIndex((r) => r.serviceCode === serviceType);
      if (existingIdx >= 0) {
        // Keep the lower rate (ACCOUNT < LIST)
        if (totalCost < rates[existingIdx].totalCost) {
          rates[existingIdx] = {
            ...rates[existingIdx],
            totalCost: parseFloat(totalCost.toFixed(2)),
            surcharges,
          };
        }
        continue;
      }

      rates.push({
        rateId: `fedex_${serviceType.toLowerCase()}`,
        carrierCode: "fedex",
        carrierName: "FedEx",
        service: serviceInfo.label,
        serviceCode: serviceType,
        transitDays: isFinite(transitDays) ? transitDays : serviceInfo.transitDays,
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency,
        surcharges,
        isLive: true,
        source: "fedex",
      });
    }

    console.log(`[FedEx] ${rates.length} live rates for ${input.destPostal}`);
    return rates;
  } catch (err) {
    console.error("[FedEx] fetchFedExRates error:", err);
    return [];
  }
}

/**
 * Purchase a FedEx shipping label via FedEx Web Services SOAP ProcessShipment.
 * Returns ZPL label content ready for Zebra printing.
 * Docs: https://www.fedex.com/en-us/developer/web-services.html
 */
export async function buyFedExLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
  const userKey = process.env.FEDEX_USER_KEY;
  const password = process.env.FEDEX_PASSWORD;
  const accountNumber = input.accountNumber || process.env.FEDEX_ACCOUNT_NUMBER || "";
  const meterNumber = input.meterNumber || process.env.FEDEX_METER_NUMBER || "";

  if (!userKey || !password) {
    return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: input.serviceCode, error: "FEDEX_USER_KEY or FEDEX_PASSWORD not configured" };
  }

  const serviceInfo = FEDEX_SERVICES[input.serviceCode] ?? { label: `FedEx ${input.serviceCode}`, transitDays: 5 };
  const weightLbs = Math.max(input.weightLbs, 0.1);
  const shipDate = new Date().toISOString().slice(0, 10);

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:v26="http://fedex.com/ws/ship/v26">
  <SOAP-ENV:Body>
    <v26:ProcessShipmentRequest>
      <v26:WebAuthenticationDetail>
        <v26:UserCredential>
          <v26:Key>${userKey}</v26:Key>
          <v26:Password>${password}</v26:Password>
        </v26:UserCredential>
      </v26:WebAuthenticationDetail>
      <v26:ClientDetail>
        <v26:AccountNumber>${accountNumber}</v26:AccountNumber>
        <v26:MeterNumber>${meterNumber}</v26:MeterNumber>
      </v26:ClientDetail>
      <v26:TransactionDetail>
        <v26:CustomerTransactionId>${input.orderNumber ?? "GD-Genius"}</v26:CustomerTransactionId>
      </v26:TransactionDetail>
      <v26:Version>
        <v26:ServiceId>ship</v26:ServiceId>
        <v26:Major>26</v26:Major>
        <v26:Intermediate>0</v26:Intermediate>
        <v26:Minor>0</v26:Minor>
      </v26:Version>
      <v26:RequestedShipment>
        <v26:ShipTimestamp>${shipDate}T12:00:00</v26:ShipTimestamp>
        <v26:DropoffType>REGULAR_PICKUP</v26:DropoffType>
        <v26:ServiceType>${input.serviceCode}</v26:ServiceType>
        <v26:PackagingType>YOUR_PACKAGING</v26:PackagingType>
        <v26:Shipper>
          <v26:Contact>
            <v26:PersonName>${escapeXml(input.originName)}</v26:PersonName>
            <v26:CompanyName>${escapeXml(input.originCompany || input.originName)}</v26:CompanyName>
            <v26:PhoneNumber>${(input.originPhone ?? "8005551234").replace(/\D/g, "")}</v26:PhoneNumber>
          </v26:Contact>
          <v26:Address>
            <v26:StreetLines>${escapeXml(input.originAddress1)}</v26:StreetLines>
            ${input.originAddress2 ? `<v26:StreetLines>${escapeXml(input.originAddress2)}</v26:StreetLines>` : ""}
            <v26:City>${escapeXml(input.originCity)}</v26:City>
            <v26:StateOrProvinceCode>${input.originState}</v26:StateOrProvinceCode>
            <v26:PostalCode>${input.originPostal.replace(/\D/g, "").slice(0, 5)}</v26:PostalCode>
            <v26:CountryCode>${input.originCountry || "US"}</v26:CountryCode>
          </v26:Address>
        </v26:Shipper>
        <v26:Recipient>
          <v26:Contact>
            <v26:PersonName>${escapeXml(input.destName)}</v26:PersonName>
            <v26:CompanyName>${escapeXml(input.destCompany || input.destName)}</v26:CompanyName>
            <v26:PhoneNumber>${(input.destPhone ?? "8005551234").replace(/\D/g, "")}</v26:PhoneNumber>
          </v26:Contact>
          <v26:Address>
            <v26:StreetLines>${escapeXml(input.destAddress1)}</v26:StreetLines>
            ${input.destAddress2 ? `<v26:StreetLines>${escapeXml(input.destAddress2)}</v26:StreetLines>` : ""}
            <v26:City>${escapeXml(input.destCity)}</v26:City>
            <v26:StateOrProvinceCode>${input.destState}</v26:StateOrProvinceCode>
            <v26:PostalCode>${input.destPostal.replace(/\D/g, "").slice(0, 5)}</v26:PostalCode>
            <v26:CountryCode>${input.destCountry || "US"}</v26:CountryCode>
            <v26:Residential>${input.isResidential ? "true" : "false"}</v26:Residential>
          </v26:Address>
        </v26:Recipient>
        <v26:ShippingChargesPayment>
          <v26:PaymentType>SENDER</v26:PaymentType>
          <v26:Payor>
            <v26:ResponsibleParty>
              <v26:AccountNumber>${accountNumber}</v26:AccountNumber>
            </v26:ResponsibleParty>
          </v26:Payor>
        </v26:ShippingChargesPayment>
        <v26:LabelSpecification>
          <v26:LabelFormatType>COMMON2D</v26:LabelFormatType>
          <v26:ImageType>ZPLII</v26:ImageType>
          <v26:LabelStockType>STOCK_4X6</v26:LabelStockType>
        </v26:LabelSpecification>
        <v26:RateRequestTypes>ACCOUNT</v26:RateRequestTypes>
        <v26:PackageCount>1</v26:PackageCount>
        <v26:RequestedPackageLineItems>
          <v26:SequenceNumber>1</v26:SequenceNumber>
          <v26:GroupPackageCount>1</v26:GroupPackageCount>
          <v26:Weight>
            <v26:Units>LB</v26:Units>
            <v26:Value>${weightLbs.toFixed(1)}</v26:Value>
          </v26:Weight>
          <v26:Dimensions>
            <v26:Length>${Math.ceil(input.lengthIn)}</v26:Length>
            <v26:Width>${Math.ceil(input.widthIn)}</v26:Width>
            <v26:Height>${Math.ceil(input.heightIn)}</v26:Height>
            <v26:Units>IN</v26:Units>
          </v26:Dimensions>
          ${input.orderNumber ? `<v26:CustomerReferences><v26:CustomerReferenceType>P_O_NUMBER</v26:CustomerReferenceType><v26:Value>${escapeXml(input.orderNumber)}</v26:Value></v26:CustomerReferences>` : ""}
        </v26:RequestedPackageLineItems>
      </v26:RequestedShipment>
    </v26:ProcessShipmentRequest>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  try {
    const resp = await fetch(FEDEX_WSDL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "http://fedex.com/ws/ship/v26/ProcessShipment",
      },
      body: soapBody,
      signal: AbortSignal.timeout(30_000),
    });

    const xmlText = await resp.text();

    if (!resp.ok) {
      console.error(`[FedEx] Label API error ${resp.status}: ${xmlText.slice(0, 400)}`);
      return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceInfo.label, error: `FedEx API ${resp.status}` };
    }

    // Extract tracking number
    const trackingMatch = xmlText.match(/<TrackingNumber>([^<]+)<\/TrackingNumber>/);
    const trackingNumber = trackingMatch?.[1] ?? "";

    // Extract label ZPL (base64 encoded)
    const labelMatch = xmlText.match(/<Image>([^<]+)<\/Image>/);
    const labelBase64 = labelMatch?.[1] ?? "";
    const labelZpl = labelBase64 ? Buffer.from(labelBase64, "base64").toString("utf-8") : undefined;

    // Extract total cost
    const costMatch = xmlText.match(/<TotalNetCharge>[\s\S]*?<Amount>([^<]+)<\/Amount>/);
    const totalCost = costMatch?.[1] ? parseFloat(costMatch[1]) : undefined;

    // Check for errors in response
    const severityMatch = xmlText.match(/<HighestSeverity>([^<]+)<\/HighestSeverity>/);
    const severity = severityMatch?.[1] ?? "";
    if (severity === "ERROR" || severity === "FAILURE") {
      const descMatch = xmlText.match(/<Message>([^<]+)<\/Message>/);
      const errMsg = descMatch?.[1] ?? "FedEx processing error";
      console.error(`[FedEx] Label error: ${errMsg}`);
      return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceInfo.label, error: errMsg };
    }

    if (!trackingNumber) {
      console.error("[FedEx] No tracking number in response:", xmlText.slice(0, 400));
      return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceInfo.label, error: "No tracking number returned" };
    }

    console.log(`[FedEx] Label purchased: ${trackingNumber} via ${serviceInfo.label}`);
    return {
      success: true,
      trackingNumber,
      carrierCode: "fedex",
      carrierName: "FedEx",
      service: serviceInfo.label,
      labelZpl,
      labelBase64,
      labelFormat: "zpl",
      labelUrl: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      totalCost,
      currency: "USD",
    };
  } catch (err) {
    console.error("[FedEx] buyFedExLabel error:", err);
    return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceInfo.label, error: err instanceof Error ? err.message : String(err) };
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
