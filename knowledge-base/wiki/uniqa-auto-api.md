# Uniqa Auto API (ZA Tech / Peak3)

**Verzija dokumenta:** V1.3 (24.07.2025)
**Provajder:** ZA Tech (Graphene platforma, tenant: `uniqahrv`)
**Produkti:** MTPL (obvezno AO) + MHull (kasko)

---

## Pregled toka

```
1. Quotation          → dobiš cijenu (periodFinalPremium)
2. Underwriting-Issuance → kreiraj prijedlog, dobiš issuanceNo
3. Issue-Issuance     → potvrdi policu, dobiš policyNo
4. Download-Document  → skini PDF police / zelene karte / računa
5. Codebook           → dohvati enum vrijednosti (grad, vrsta vozila...)
```

> ⚠️ **Važno:** `partnerNo` mora biti **isti** kroz sve 3 faze (quotation → underwriting → issue). Čuvaj ga.

---

## Konstante

| Što | Vrijednost |
|---|---|
| `partnerCode` | `"UniqaAgencyChannel"` |
| `planId` MTPL | `1217324174557184` |
| `planId` MHull | `921476643438592` |
| `productId` MTPL | `1215969347272704` |
| `productId` MHull | `911453179625479` |
| `bonusMalusScenario` | `"B4"` |
| `isQuickQuotation` | `false` |
| `premiumFrequencyType` | `"SINGLE"` |

---

## 1. Quotation

**POST** `{{base_url}}/v2/standard/policy/quotation`

### Ključna polja requesta

| Polje | Tip | Napomena |
|---|---|---|
| `partnerCode` | String | "UniqaAgencyChannel" |
| `partnerNo` | String | Random 10+ znamenki, **spremi ga** |
| `planId` | String | Ovisno o produktu |
| `policyFactors.policyEffectiveStartDate` | Date | `YYYY-MM-DDTHH:MM:SS.000Z` |
| `policyFactors.policyExpiryDate` | Date | `YYYY-MM-DDTHH:MM:SS.000Z` |
| `policyFactors.E_isDiplomat` | Enum | `YES/NO` |
| `insuredFactors.certiNo` | String | OIB |
| `insuredFactors.customerType` | Enum | `PERSON` / `COMPANY` |
| `insuredFactors.birthday` | Date | `YYYY-MM-DD` (samo za PERSON) |
| `objectFactors.plateNo` | String | Bez gradskog koda |
| `objectFactors.plateRegistrationZone` | String | Gradski kod (npr. ZG) |
| `objectFactors.vinNo` | String | VIN broj vozila |
| `objectFactors.yearOfManufactoring` | Num | Godina proizvodnje |
| `objectFactors.enginePower` | Num | kW |
| `objectFactors.vehicleLeasing` | String | `1`=DA, `2`=NE |
| `objectFactors.isNotRegistered` | Enum | YES/NO (pazi na negaciju!) |
| `objectFactors.vehicleUsage` | String | `"StandardUsage"` — ostalo iz Codebooka |
| `objectFactors.vehicleGroup` | String | `"Passenger"` za auto |
| `commonInfo.isQuickQuotation` | Boolean | uvijek `false` |
| `products[].productId` | String | Ovisno o produktu |

**MHull specifično:**
- `claimStackFactors` — obavezan (stackCode + stackValue)
- `policyHolderFactors` — obavezan (certiNo, customerType, birthday)

### Response — što koristiti

```json
{
  "value": {
    "planSaPremium": {
      "periodFinalPremium": "XXX.XX"  ← ovo ide u underwriting-issuance kao premium
    }
  },
  "success": true
}
```

---

## 2. Underwriting-Issuance

**POST** `{{base_url}}/v2/standard/policy/underwriting-issuance`

### Ključna polja requesta

| Polje | Napomena |
|---|---|
| `partnerNo` | **Isti** kao u quotation |
| `agentCode` | Tvoj agentski kod (od Uniqa) |
| `branchCode` | Tvoj branch kod (od Uniqa) |
| `premium` | `periodFinalPremium` iz quotation responsa |
| `extensions.bonusMalusScenario` | `"B4"` |
| `issueWithoutPayment` | `YES/NO` |
| `issuanceHolder` | Kompletni podaci ugovaratelja (ime, OIB, adresa, tel, email) |
| `paymentPlan.payMethod` | `CREDIT_CARD` / `ACCOUNTTYPE_DEBIT_CARD` / `BANK_SLIP` |

**Adresa** — polje `adress` (typo u API-u, s jednim 'd'):
- `adressType`: `PERMANENT` (glavna) ili `CONTACT` (dostava)
- `zipCode` mora odgovarati `adress13` (ime grada)

**Telefon format:**
```json
{
  "phoneNo": "912345678",     ← bez 0 i bez +385
  "phoneType": "PHONE",
  "countryCode": "+385"
}
```

### Response

```json
{
  "value": {
    "pass": true,
    "issuanceStatus": "WAITING_FOR_ISSUANCE",
    "issuanceNo": "XXXXXXXXX"   ← spremi ovo!
  }
}
```

> Ako `pass: false` i status `PENDING_PROPOSAL_CHECK` — polica čeka ručnu provjeru.

---

## 3. Issue-Issuance

**POST** `{{base_url}}/v2/standard/policy/issue-issuance`

```json
{
  "partnerCode": "UniqaAgencyChannel",
  "partnerNo": "{{isti kao uvijek}}",
  "issuanceNo": "{{iz underwriting responsa}}"
}
```

### Response

```json
{
  "value": {
    "policyNo": "XXXXXXXXX",   ← broj police
    "underwritingResult": {
      "pass": true
    }
  }
}
```

---

## 4. Download-Document

**POST** `{{base_url}}/v1/download/e-document`

```json
{
  "partnerCode": "UniqaAgencyChannel",
  "partnerNo": "{{isti}}",
  "businessNo": "{{policyNo}}",
  "documentType": "POLICY"    ← ili GREEN_CARD, INVOICE
}
```

Response vraća `document.content` — raw sadržaj fajla (base64 ili plain).

---

## 5. Codebook

**GET** `{{base_url}}/v1/codebook/list` — lista svih ključeva
**GET** `{{base_url}}/v1/codebook/{{key}}` — vrijednosti za ključ

Korisni ključevi: `/vehicleUsage`, `/vehicleGroup`, `/discountsMTPL`, `/discountsMHULL`, `/coverageMTPL`, `/coverageMHULL`

---

## Česti errori

| # | Poruka | Uzrok | Rješenje |
|---|---|---|---|
| 1 | "validate inputs" (200) | Nedostaje obavezno polje | Provjeri sve mandatory polje |
| 2 | "premium is inconsistent" (400) | Premium iz quotation ne odgovara / nedostaje coverage | Uzmi `periodFinalPremium` točno iz quotation responsa |
| 3 | "do underwriting before issue" (400) | Krivi `partnerNo` u issue koraku | Koristi isti `partnerNo` kroz cijeli flow |
| 4 | "System error" (500) | Serverska greška | Kontaktiraj Uniqa podršku |

---

## Postman collection struktura

```
CubisPlacanja/
  POST AuthUser
  POST ZaprimiSred_Placanja
MHULL Example:
  POST 1. FQ (K)                  ← Quotation
  POST 1. Cr. Iss. (K)            ← Underwriting-Issuance
  POST 2. FQ (K) - Leasing
  POST 2. Cr. Iss. (K) - Leasing
MTPL Example:
  POST 1. FQ (K)
  POST 1. Cr. Iss. (K)
  POST 2. FQ (K) - Leasing
  POST 2. Cr. Iss. (K) - Leasing
Global calls:
  POST Issue issuance             ← Issue-Issuance
  POST Download-Document
  GET  Codebook
```

---

## Veza s implementacijom

- Naš proxy: `wiener-proxy/` (port 3002 na Oracle)
- Naš test: `/uniqa-test/` — radi u UAT, čeka produkcijske kredencijale od Filipa
- UAT environment: `Peak3 - UAT.postman_environment.json`
