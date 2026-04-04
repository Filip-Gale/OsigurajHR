# AS Direct (Generali) AO API

**Platforma:** AS Direct (Generali Osiguranje)
**Produkt:** Obvezno AO osiguranje + kasko paketi
**Tip auth:** Basic Authorization
**Verzija dokumenta:** 05.06.2025.

---

## Pregled toka

```
1. GetQuote       → POST /api/as/v1/GetQuote       → info izračun, paketi, popusti
2. GenPolicy      → POST /api/as/v1/GenPolicy       → izradi policu (bez statusa)
3. SetPaymentStatus → POST /api/as/v1/SetPaymentStatus → potvrdi plaćanje → polica postaje validna
4. PostGenPayment → POST /api/naplata/v1/GenPayment → kreiranje naplate
```

---

## Base URL

| Okolina | URL |
|---|---|
| Test | `https://asdirectprod.generali.hr:8080/TestAutoOsiguranje/` |
| Produkcija | `https://asdirectprod.generali.hr:8080/AutoOsiguranje/` |

Autentifikacija: `Authorization: Basic` (na svakom requestu)

---

## 1. GetQuote (info izračun)

**POST** `/api/as/v1/GetQuote`

### Request

```json
{
  "vozilo": {
    "registracija": "RI",
    "snagaMotora": 100,
    "godinaProizvodnje": "2021",
    "novonabavnaVrijednostVozila": null
  },
  "osiguranik": {
    "godinaRodjenja": "2001",
    "tipStranke": "F"
  },
  "datumPocetkaOsiguranja": "2022-06-02",
  "premijskiStupanjAo": 10,
  "premijskiStupanjAk": 2,
  "brojPoliceZaObnovu": null,
  "posrednik": "411111",
  "pausalnoOsiguranjeDodatneOpreme": true
}
```

### Ključna polja

| Polje | Napomena |
|---|---|
| `vozilo.registracija` | Dvoslovna oznaka dovoljna (npr. `"ZG"`) ili puna registracija |
| `vozilo.snagaMotora` | Integer, bez "kW" |
| `vozilo.godinaProizvodnje` | String; ako prazno → kasko se ne nudi |
| `vozilo.novonabavnaVrijednostVozila` | Double; > 80000 EUR ili > 12 god. starosti → nema kaska |
| `osiguranik.tipStranke` | `"F"`=Fizička, `"P"`=Pravna, `"O"`=Obrt |
| `osiguranik.godinaRodjenja` | Obvezan za tip `F` |
| `datumPocetkaOsiguranja` | `YYYY-MM-DD`; ne smije biti u prošlosti (osim obnova: max 14 dana unatrag) |
| `premijskiStupanjAo` | Integer 1–18; obvezan ako nema `brojPoliceZaObnovu` |
| `posrednik` | Obvezan (npr. `"411111"`) |
| `brojPoliceZaObnovu` | Ako dostavljeno — PS se sam računa, ignoriraju se dostavljeni PS |

### Response

```json
{
  "apiResponse": { "status": 200, "message": "OK", "errors": null },
  "premijaAOBezPoreza": 539.67,
  "porez": 15,
  "ps_AO": 10,
  "ps_AK": 10,
  "paketi": [
    { "code": "AO_PLUS",    "premijaBezPoreza": 15.0,  "premium": "perc", "porez": 0  },
    { "code": "ASIST_HR",   "premijaBezPoreza": 16.0,  "premium": "fix",  "porez": 0  },
    { "code": "ASIST_SVE",  "premijaBezPoreza": 32.0,  "premium": "fix",  "porez": 0  },
    { "code": "DIVLJAC",    "premijaBezPoreza": 46.0,  "premium": "fix",  "porez": 10 },
    { "code": "KASKO_1000", "premijaBezPoreza": 254.85,"premium": "fix",  "porez": 10 },
    { "code": "KASKO_140",  "premijaBezPoreza": 661.01,"premium": "fix",  "porez": 10 },
    { "code": "KASKO_400",  "premijaBezPoreza": 517.66,"premium": "fix",  "porez": 10 },
    { "code": "NEZGODA",    "premijaBezPoreza": 8.0,   "premium": "fix",  "porez": 0  },
    { "code": "STAKLA",     "premijaBezPoreza": 50.0,  "premium": "fix",  "porez": 10 }
  ],
  "popusti": [
    { "code": "ZAS_BON",  "min": 8,  "max": 8,  "applicableTo": ["AO"],        "group": "1", "pd": "D" },
    { "code": "FLO_ISK",  "min": 25, "max": 25, "applicableTo": ["AO"],        "group": "2", "pd": "P" },
    { "code": "RIZ_OPA",  "min": 30, "max": 30, "applicableTo": ["AO","KASKO_140","KASKO_400","KASKO_1000"], "group": "3", "pd": "D" },
    { "code": "AS_DIRE_1","min": 0,  "max": 10, "applicableTo": ["*"],          "group": "4", "pd": "P" },
    { "code": "AS_OBNO_1","min": 0,  "max": 10, "applicableTo": ["*"],          "group": "5", "pd": "P" }
  ],
  "novonabavnaVrijednostVozila": 10000.0,
  "osiguranaSvota": 10500.0
}
```

### Napomene o paketima i popustima

- `premium: "perc"` = postotak od AO osnove; `"fix"` = fiksni iznos
- `porez` na paketu = postotak poreza za taj paket
- `pd: "D"` = doplatak, `"P"` = popust
- `group` = popusti u istoj grupi ne mogu se kombinirati
- `applicableTo: ["*"]` = primjenjuje se na sve stavke

---

## 2. GenPolicy (izrada police)

**POST** `/api/as/v1/GenPolicy`

### Request

```json
{
  "vozilo": {
    "sasija": "WRTUZ………",
    "proizvodac": "BMW",
    "model": "1",
    "registracija": "RI0101OI",
    "snagaMotora": 100,
    "godinaProizvodnje": "2021",
    "novonabavnaVrijednostVozila": null
  },
  "ugovaratelj": {
    "ime": "Ivo",
    "prezime": "Ivić",
    "naziv": "ime firme",
    "oib": "12345678901",
    "datumRodjenja": "2000-01-02",
    "ulica": "Ilica",
    "kucniBroj": "12B",
    "mjesto": "72150",
    "spol": "M",
    "ulicaNaplate": "Ilica",
    "kucniBrojNaplate": "12B",
    "mjestoNaplate": "72150",
    "tipStranke": "F",
    "mobitel": "38591123456",
    "email": "ivo.ivic@gmail.com",
    "marketinskaSuglasnost": "N",
    "provjeraStranke": true
  },
  "osiguranik": { "...isti podaci kao ugovaratelj..." },
  "paketi": [
    { "code": "AO_PLUS",   "selected": true  },
    { "code": "NEZGODA",   "selected": true  },
    { "code": "ASIST_HR",  "selected": true  },
    { "code": "ASIST_SVE", "selected": false },
    { "code": "KASKO_1000","selected": false },
    { "code": "DIVLJAC",   "selected": false },
    { "code": "STAKLA",    "selected": false }
  ],
  "popusti": [
    { "code": "AS_OBNO_1", "stopa": "10" },
    { "code": "RIZ_TAX",   "stopa": "30" }
  ],
  "datumPocetkaOsiguranja": "2022-06-02",
  "satOsiguranja": "00:00",
  "premijskiStupanjAo": 10,
  "premijskiStupanjAk": 2,
  "leasing": "N",
  "brojStarePolice": null,
  "brojPoliceZaObnovu": null,
  "posrednik": "412121",
  "pausalnoOsiguranjeDodatneOpreme": true
}
```

### Ključna polja

| Polje | Napomena |
|---|---|
| `vozilo.sasija` | Obvezan za GenPolicy (nije za GetQuote) |
| `ugovaratelj.mobitel` | Format `3859xxxxxxx` (bez +, s pozivnim) |
| `ugovaratelj.mjesto` | Šifra mjesta iz GetMjesta (npr. `"72150"`) |
| `ugovaratelj.spol` | `"M"` ili `"Z"` |
| `ugovaratelj.tipStranke` | `"F"`, `"P"` ili `"O"` |
| `ugovaratelj.provjeraStranke` | `true` = prihvati eventualne promjene podataka stranke u IN2 |
| `paketi[].selected` | `true` = ugovori; `false` = ne ugovori (šalji sve pakete s flagom) |
| `popusti[].stopa` | String s iznosom postotka (npr. `"10"`) |
| `leasing` | `"N"` ili `"D"` |

### Ponašanje kod stranke (provjeraStranke)

- Ako `provjeraStranke: false` i stranka postoji u IN2 s različitim podacima → API vraća greške i zahtjeva provjeru
- Postavi `provjeraStranke: true` i ponovi request → ažurira stranku + šalje mail administraciji
- Za pravne osobe i obrte: uzimaju se podaci iz IN2 (osim novih stranki)

### Response

```json
{
  "apiResponse": { "status": 200, "message": "OK", "errors": null },
  "brojPolice": "325123456789",
  "cijenaPorez": 1000.72,
  "PS_AO": 1,
  "PS_AK": 10
}
```

> Polica se kreira **bez statusa** (nije validna). Postaje validna tek nakon SetPaymentStatus.

---

## 3. SetPaymentStatus (potvrda plaćanja)

**POST** `/api/as/v1/SetPaymentStatus`

```json
{
  "brojPolice": "325123456789",
  "brojSasije": "WRTUZT…",
  "paid": true,
  "storno": false
}
```

- `paid: true` → polica dobiva status Z (validna)
- `storno: true` → polica dobiva status SG (stornirana)
- Jedan od `paid`/`storno` mora biti `true`

### Response

```json
{
  "apiResponse": { "status": 200, "message": "OK" },
  "brojPolice": "325123456789",
  "polica": "<base64 PDF>",
  "brojZK": "1031234567",
  "ZK": "<base64 PDF>",
  "poruka": "Polica je zaključena"
}
```

Response vraća PDF police i zelene karte (base64). Sprema u eVP bazu.

---

## 4. GetPolicyDetails (premijski stupnjevi)

**POST** `/api/as/v1/GetPolicyDetails`

```json
{ "brojPolice": "325123456789", "oibOsiguranika": "12345678901" }
```

Response: `PS_AO`, `PS_AK`, `NNV` (novonabavna vrijednost)

---

## 5. GetPodaci (HUOMTR — automatski PS)

**POST** `/api/huomtr/v1/GetPodaci`

```json
{ "oib": "12345678903", "godinaRodjenja": 1981 }
```

Response: `premijskiStupanj` (1–18) + detalji (brojPolica, brojSteta, ...)

---

## 6. Šifrarnici

| Metoda | Endpoint | Opis |
|---|---|---|
| GET | `/api/v1/GetMjesta` | Sva mjesta: `{ "mjesto": "10006", "postanskiBroj": "42222", "naziv": "ČURILOVEC" }` |
| GET | `/api/naplata/v1/GetNacinPlacanja` | Načini plaćanja: `{ "sifra": 2, "naziv": "kartica" }` |
| GET | `/api/naplata/v1/GetKartice` | Kartice: `["VISA", "MASTERCARD", "MAESTRO", ...]` |

---

## 7. Naplata (PostGenPayment)

**POST** `/api/naplata/v1/GenPayment`

```json
{
  "idTransakcije": 1,
  "oib": "05980341366",
  "brojPolice": "5100196202",
  "iznos": 239.38,
  "posrednik": "500649",
  "nacinPlacanja": 2,
  "webShop": false,
  "brojOdobrenja": "001122",
  "nazivKartice": "VISA",
  "brojKartice": "*****1234",
  "banka": "PBZ",
  "brojRata": 1
}
```

- `nacinPlacanja: 2` = kartica (jedina podržana vrijednost)
- Na isti dan ne može se poslati više naplata za istu policu
- Response: `{ "idTransakcije": "1", "brojPolice": "5100196202" }`

---

## 8. Dokumentacija (GetDokumenti)

**GET** `/api/dokumentacija/v1/GetDokumenti`

```json
{ "faza": "predugovorna" }
```

Dozvoljene vrijednosti `faza`: `"predugovorna"`, `"ugovorna"`, `"sve"`

Response: lista dokumenata s `filename`, `filedata` (byte[]), `applicableTo`, `faza`

- `applicableTo: ["*"]` = uvijek se dostavlja
- `applicableTo: ["NEZGODA"]` = samo ako je NEZGODA odabran paket

---

## 9. SendPhotos (kasko fotografije)

**POST** `/api/v1/upload/Casco/Vehicle/Images`

```json
{
  "brojPolice": "5123456789",
  "emailZastupnika": "test@generali.hr",
  "listaDatoteka": [
    { "naziv": "naziv_1", "mimeType": "image/jpg", "data": "<Base64>" }
  ]
}
```

---

## Error format

```json
{
  "timestamp": "2022-06-20_12-06-50",
  "status": 400,
  "message": "Bad Request",
  "errors": ["nije dostavljena snaga motora", "prethodna polica ne postoji u sustavu"]
}
```

Sve greške vraćaju se u jednom responseu (osim format grešaka koje Java vraća nativno).

---

## Veza s implementacijom

- Status: **nije implementirano** — Oracle proxy nije postavljen za ovaj endpoint
- Test URL: `https://asdirectprod.generali.hr:8080/TestAutoOsiguranje/`
- Raw fajlovi: `raw/as-direct/ao-dokumentacija.docx`, `raw/as-direct/parametri.pdf`
- Credentials: traži od Generalija (`posrednik` kod, Basic auth)
- Bloker: Worker ne prolazi kroz Oracle IP `158.180.27.110` za ovaj host
