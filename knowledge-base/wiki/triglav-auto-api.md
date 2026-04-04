# Triglav Auto API (AdInsure / B2B)

**Platforma:** AdInsure WebAPI (Adacta), v2.0 (31.10.2025)
**Produkt:** AO (obvezno automobilsko osiguranje), produkt `NV0450001`
**Tip auth:** Token-based (OAuth2 password grant)

---

## Pregled toka

```
1. Token         → POST /Token → dobij access_token
2. Get-Premium   → POST /get-premium → izračunaj cijenu (ne kreira policu)
3. Create-Policy → POST /create-policy → kreiraj policu + fakturu
4. Print         → POST /print → skini PDF (polica / zelena karta / faktura)
```

---

## Base URL

**PP (preprod/UAT):** `https://b2bapi-pp.tozg.hr/Adinsure.Web.B2BAPI-TOZG-PP`
**Produkcija:** traži od Triglava

Sve metode: `/api/public/v1/policies/NV0450001B2B/{metoda}`

---

## 1. Autentifikacija

**POST** `{{base_url}}/Token`

```
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={{user}}&password={{pass}}
```

Response:
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Svaki sljedeći request: `Authorization: Bearer {access_token}`

---

## 2. Get-Premium (kalkulator)

**POST** `.../get-premium`

```json
{
  "StartDate": "2025-09-18T22:00:00.000Z",
  "EndDate": "2026-09-18T22:00:00.000Z",
  "Invoice": null,
  "IsProRate": true,
  "FromDashboard": true,
  "Sale": {
    "Discounts": [{ "DiscountId": "COMMERCIAL_DISCOUNT" }]
  },
  "PersonalVehicleCoverage": {
    "BasicSubCoverage": {
      "PackageType": 0,
      "AgeOfTheInsured": 1,
      "PowerInKW": 65,
      "VehicleRegistration": "ZG1234AB",
      "ChassisNumber": "VIN123...",
      "VehicleBrand": "KIA",
      "VehicleType": "CARAVAN",
      "YearOfProduction": 2021,
      "VolumeInCCM": 1000,
      "NumberOfSeats": 5,
      "IsVehicleInLeasing": 0,
      "IsSpecialPlatesVehicle": 0
    },
    "VehicleSubCoverage": {
      "IsEnabled": true,
      "PremiumClass": 1,
      "CoverageHeight": 1,
      "RiskFactorForOtherCountries": 1,
      "OverheadAllowance": 40
    }
  },
  "PreviousPolicy": null,
  "Persons": [
    {
      "PersonRoles": [0, 1],
      "NaturalPerson": {
        "Name": "Ime",
        "Surname": "Prezime",
        "DateOfBirth": "2000-09-14T22:00:00.000Z",
        "TaxNumber": "OIB_11_ZNAMENKI",
        "Gender": 1,
        "IsResident": true,
        "MobileTelephoneNumber": "0914665237",
        "Email": "email@example.com",
        "Addresses": [{
          "AddressTypeId": 4,
          "CountryId": "HR",
          "Street": "Ulica",
          "HouseNumber": "1",
          "PostNumber": "10000",
          "City": "Zagreb"
        }]
      }
    }
  ],
  "PolicyTypeId": 0
}
```

### Ključna polja

| Polje | Napomena |
|---|---|
| `PersonRoles` | `[0, 1]` = ugovaratelj + osiguranik isti |
| `AddressTypeId` | `4` = stalna adresa fizičke osobe |
| `Gender` | `0`=Neutral, `1`=Muški, `2`=Ženski |
| `PremiumClass` | bonus-malus klasa |
| `PolicyTypeId` | `0`=Polica, `2`=InfoPolica |
| `AgentId` | Tvoj agentski ID (od Triglava) |

---

## 3. Create-Policy

**POST** `.../create-policy`

Isti body kao `get-premium`, plus:

```json
{
  "Invoice": {
    "PaymentModeId": 0,
    "PaymentTypeFirstId": 2,
    "PaymentTypeOtherId": 2,
    "FirstInstallment": 422.99,
    "OtherInstallments": 0
  },
  "AgentId": 21448
}
```

Response vraća `PolicyId` koji koristiš za print.

---

## 4. Print

**POST** `.../print`

```json
{
  "PolicyId": 123456,
  "DocumentType": "Policy"
}
```

`DocumentType` vrijednosti: `"Policy"`, `"GreenCard"`, `"Invoice"`

Response: base64 PDF dokument.

---

## Enum vrijednosti

| Enum | Vrijednosti |
|---|---|
| `PersonRoles` | `0`=NaturalPerson, `1`=LegalPerson |
| `Gender` | `0`=Neutral, `1`=Male, `2`=Female |
| `AddressTypeId` | `4`=stalna adresa fiz. osobe, `1`=sjedište prav. osobe |
| `PolicyTypeId` | `0`=Polica, `1`=Aneks, `2`=InfoPolica, `3`=KontrolnaPolica |
| `PaymentTypeId` | `2`=Jednokratno (ostalo traži od Triglava) |

---

## Error response format

```json
{
  "Message": "Opis greške",
  "Code": "ERROR_CODE",
  "Details": "...",
  "IncidentId": "...",
  "Errors": []
}
```

---

## Veza s implementacijom

- Status: **integracija u tijeku** — postman collection radi na PP okruženju
- Credentials za PP: traži od Triglava (AgentId, username/password)
- Raw fajlovi: `raw/triglav/ao-technical-spec.docx`, `raw/triglav/ao-postman.json`
