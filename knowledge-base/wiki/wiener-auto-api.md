# Wiener Auto API (WING)

**Platforma:** WING (Vienna Insurance Group)
**Produkt:** Obvezno AO osiguranje
**Tip auth:** 2-koračni OAuth2 (Authenticate → WingAuth)

---

## Pregled toka

```
1. Authenticate    → POST /v1/Authenticate      → 3Scale bearer token
2. WingAuth        → POST /v1/WingAuth          → X-Wovig-Authorization token
3. Codebooks       → GET  /v1/CodebooksAO       → šifrarnici (gorivo, vozila...)
4. VehicleMakes    → GET  /v1/VehicleMakes       → marke vozila
5. CalculateAOv2   → POST /v1/CalculateAOv2      → kalkulator cijene
6. ReservePolicy   → POST /v1/ReservePolicy      → rezerviraj policu
7. ActivatePolicy  → POST /v1/ActivatePolicyWithPayment ili /v1/ActivatePolicy
```

---

## Base URL

`https://{okolina}.services.wiener.hr`

Okoline: `prod`, `test` (točni prefiksi traži od Wienera)

---

## 1. Autentifikacija — 2 koraka

### Korak 1: 3Scale token

**POST** `/v1/Authenticate`

```
Authorization: OAuth2.0
  client_id: *** (od Wienera)
  client_secret: *** (od Wienera)
  Auth URL: https://secure-sso-rh-sso.services.wiener.hr/auth/realms/vanjski/protocol/openid-connect/auth
  Access Token URL: https://secure-sso-rh-sso.services.wiener.hr/auth/realms/vanjski/protocol/openid-connect/token
```

Response: `{ "access_token": "...", "expires_in": 3600, "token_type": "Bearer" }`

### Korak 2: WING token

**POST** `/v1/WingAuth`

```
Header: Authentication: bearer {3Scale token}
Body (x-www-form-urlencoded):
  grant_type: password
  scope: wing.api idp.users.api
  client_id: ***
  client_secret: ***
  username: ***
  password: ***
```

Response: `{ "access_token": "...", "token_type": "Bearer" }`

**Svaki sljedeći request šalje oba headera:**
- `Authentication: bearer {3Scale token}`
- `X-Wovig-Authorization: bearer {WING access_token}`

---

## 2. Šifrarnici (Codebooks)

| Endpoint | Metoda | Vraća |
|---|---|---|
| `/v1/CodebooksAO` | GET | Sve — gorivo, tip vozila, kategorije |
| `/v1/VehicleMakes` | GET | Marke vozila (AUDI, BMW...) |
| `/v1/InsuredSumsAO` | GET | Osigurane svote v1 |
| `/v1/InsuredSumsAOv2` | GET | Osigurane svote v2 |
| `/v1/ClassificationsDriverAO` | GET | Klasifikacije vozača |
| `/v1/ClassificationsPassengersAO` | GET | Klasifikacije putnika |
| `/v1/CalculateAOOptions` | GET | Opcije za kalkulaciju |
| `/v1/VehicleInfo` | GET | Podaci o vozilu po VIN-u |

**Tip vozila za osobni auto:** `PG1` / `Osobni automobil` / kategorija `M1`

---

## 3. Kalkulacija

Postoje 2 pristupa:

**A) Paketi** — predefinirana skupina rizika, lakše:
- **POST** `/v1/CalculatePackagesAO` (v1)
- **POST** `/v1/CalculatePackagesAOv2` (v2 — preporučeno)

**B) Šifrarnici** — ručni odabir pokrića:
- **POST** `/v1/CalculateAO` (v1)
- **POST** `/v1/CalculateAOv2` (v2 — preporučeno)

---

## 4. Partner (klijent)

Prije kreiranja police, klijenta treba kreirati/ažurirati:

- **GET** `/v1/partners/search/legal` — traži pravnu osobu
- **POST** `/v1/partners/UpdateOrCreate/natural` — kreiraj/ažuriraj fizičku osobu
- **POST** `/v1/partners/UpdateOrCreate/legal` — kreiraj/ažuriraj pravnu osobu

---

## 5. Predugovorna dokumentacija

**POST** `/v1/PrePolicyDocuments` — generiraj i pošalji dokumente klijentu prije sklapanja police

---

## 6. Kreiranje police

### Rezervacija
**POST** `/v1/ReservePolicy` → dobij rezervirani broj police

### Aktivacija s plaćanjem
**POST** `/v1/ActivatePolicyWithPayment` → aktiviraj s podacima o plaćanju

### Aktivacija bez plaćanja
**POST** `/v1/ActivatePolicy` → aktiviraj direktno

### Otkazivanje rezervirane police
**POST** `/v1/CancelReservedPolicy`

### Otkazivanje aktivne police
**POST** `/v1/CancelActivePolicy`

### Potvrda dostave
**POST** `/v1/PolicyDelivered`

### Dokument klijentu
**POST** `/v1/ClientDocument`

---

## Napomene

- Token ima `sliding expire` — može se sam refreshati
- Endpoint za refresh je isti kao i za dohvat tokena
- Wiener koristi kodove za tipove vozila (npr. `M1` za osobni auto, `L1` za motocikl)
- `{okolina}` u URL-u: zamijeni s `prod` ili `test` — točne vrijednosti traži od Wienera

---

## Veza s implementacijom

- Status: **proxy postavljen** (`wiener-proxy/` na Oracle port 3002)
- Commit: `fb3c846` — wiener-worker proxy na Oracle
- Raw fajl: `raw/wiener/ao-dokumentacija.docx`
- Credentials: svi markirani s `***` — traži od Wienera
