# Uniqa Zdravstveno API (PZO + DZO)

**Platforma:** Cubis (Incubis d.o.o.), v3.1 — SOAP servis
**Produkti:** PZO (putno zdravstveno) + DZO (dobrovoljno zdravstveno)
**Tip auth:** Session GUID (AuthUser)

> ⚠️ **SOAP, ne REST.** Svaka metoda prima `ParamList` (niz `{Name, Value}` parova).
> Response je uvijek `{ _ResponseType, _Message, _Payload }`.

---

## Protokol

```csharp
// AuthUser — isto za PZO i DZO
Param[] paramsAuth = new Param[] {
  new Param() { Name="Username", Value="KORISNICKO_IME" },
  new Param() { Name="Password", Value="LOZINKA" }
};
ResponseClass rcLogin = client.AuthUser(paramsAuth);
string loginGuid = rcLogin._Payload;  // ← čuvaj ovo za sve daljnje pozive
```

Response format:
```csharp
public class ResponseClass {
  public string _ResponseType = "OK";  // "OK" ili greška
  public string _Message = "";
  public string _Payload = "";         // JSON string ili base64
}
```

---

## DZO — Dobrovoljno zdravstveno osiguranje

### Pregled toka

```
1. AuthUser            → loginGuid
2. DZO_VratiCjenike    → dostupni cjenici (šifre paketa)
3. DZO_VratiRizike     → rizici za odabrani cjenik + datum rojstva
4. DZO_VratiPopuste    → dostupni popusti
5. DZO_Validiraj_MBO   → validacija HZZO broja (opcionalno)
6. DZO_IzracunajPremiju → izračun premije
7. DZO_SpremiPolicu    → kreiranje police → BrojPolice + UkupnaPremija
```

### DZO_VratiCjenike

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id", Value = loginGuid }
};
var rc = client.DZO_VratiCjenike(p);
// Payload: JSON s dostupnim cjenicima, npr. "SIN19"
```

Poznate šifre cjenika: `SIN19` (single/individualni paket 2019+)

### DZO_VratiRizike

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",           Value = loginGuid },
  new Param() { Name = "Cjenik",       Value = "SIN19" },
  new Param() { Name = "DatumRodenja", Value = "15.11.1972" }
};
var rc = client.DZO_VratiRizike(p);
```

### DZO_IzracunajPremiju

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",           Value = loginGuid },
  new Param() { Name = "DatumRodenja", Value = "01.01.1981" },
  new Param() { Name = "Cjenik",       Value = "SIN19" },
  new Param() { Name = "Rizici",       Value = "SIN19" }
};
ResponseClass rc = client.DZO_IzracunajPremiju(p);
decimal premija = decimal.Parse(rc._Payload);
```

### DZO_Validiraj_MBO (HZZO broj)

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",      Value = loginGuid },
  new Param() { Name = "HZZOBroj", Value = "458436548" }
};
var rc = client.DZO_Validiraj_MBO(p);
```

### DZO_SpremiPolicu

```csharp
var rc = client.DZO_SpremiPolicu(paramsPokrica);
dynamic result = JsonConvert.DeserializeObject<ExpandoObject>(rc._Payload);
double premija    = result.UkupnaPremija;
string brojPolice = result.BrojPolice;
```

### DZO_VratiPopuste

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id", Value = loginGuid }
};
var rc = client.DZO_VratiPopuste(p);
```

---

## PZO — Putno zdravstveno osiguranje

### Pregled toka

```
1. AuthUser                        → loginGuid
2. PZOP5_VratiCjenike              → dostupni cjenici
3. PZOP5_VratiPokricaSVarijantama  → pokrića s varijantama
4. PZOP5_VratiRazlogPutovanja      → razlozi putovanja
5. PZOP5_VratiTestOsiguranike      → template tablice osiguranika
6. PZOP5_IzracunajPremiju          → izračun premije
7. PZOP5_SpremiPolicu              → kreiranje police
8. PZOP5_IspisPolice               → PDF police (base64)
```

### PZOP5_VratiCjenike

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",       Value = loginGuid },
  new Param() { Name = "Proizvod", Value = "P5" }
};
var rc = client.PZOP5_VratiCjenike(p);
// Payload: JSON lista cjenika, npr. "P51,180311"
```

### PZOP5_VratiPokricaSVarijantama

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",           Value = loginGuid },
  new Param() { Name = "Proizvod",     Value = "P5" },
  new Param() { Name = "Cjenik",       Value = "P51,180311" },
  new Param() { Name = "Destinacija",  Value = "I" },    // "I"=Inozemstvo
  new Param() { Name = "PutovanjeOd", Value = "20.05.2016" },
  new Param() { Name = "PutovanjeDo", Value = "27.05.2016" }
};
var rc = client.PZOP5_VratiPokricaSVarijantama(p);
DataTable dt = JsonConvert.DeserializeObject<DataTable>(rc._Payload);
```

### PZOP5_VratiRazlogPutovanja

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",           Value = loginGuid },
  new Param() { Name = "Proizvod",     Value = "P5" },
  new Param() { Name = "Razlog",       Value = "3" },    // 3=Privremen rad u inozemstvo
  new Param() { Name = "PutovanjeOd", Value = "20.05.2016" },
  new Param() { Name = "PutovanjeDo", Value = "27.05.2016" }
};
```

### PZOP5_VratiTestOsiguranike

Vraća DataTable s 3 test osiguranika — koristi se kao template koji se puni ispravnim podacima:
```csharp
Param[] p = new Param[] { new Param() { Name = "Id", Value = loginGuid } };
var rc = client.PZOP5_VratiTestOsiguranike(p);
DataTable dtOsig = JsonConvert.DeserializeObject<DataTable>(rc._Payload);
// Popuni tablicu ispravnim podacima osiguranika...
```

Kolone tablice uključuju: `VrijednostPrtljage` (posebno po osiguraniku)

### PZOP5_IzracunajPremiju i PZOP5_SpremiPolicu

Iste ulazne parametre prima oba poziva:

```csharp
string osiguraniciJSON = JsonConvert.SerializeObject(dtOsig);
Param[] p = new Param[] {
  new Param() { Name = "Id",                      Value = loginGuid },
  new Param() { Name = "SkupOS_Sifra",             Value = "P5" },
  new Param() { Name = "Cjenik",                   Value = "P51,180311" },
  new Param() { Name = "Ugovaratelj",              Value = "SIFRA_UGOVARATELJA" },
  new Param() { Name = "PutovanjeOd",             Value = "20.05.2016" },
  new Param() { Name = "PutovanjeDo",             Value = "27.05.2016" },
  new Param() { Name = "NamjenaPutovanja",         Value = "I" },
  new Param() { Name = "DatumPlacanjaPutovanja",  Value = "21.04.2016" },
  new Param() { Name = "DatumPlacanjaPremije",    Value = "21.04.2016" },
  new Param() { Name = "SredstvoPlacanja",         Value = "KAR" },
  new Param() { Name = "Pokrice1",                 Value = "180311,P511" },
  new Param() { Name = "Pokrice1Varijanta",        Value = "0011" },
  new Param() { Name = "Pokrice2",                 Value = "180312,P512" },
  new Param() { Name = "Pokrice2Varijanta",        Value = "0015" },
  new Param() { Name = "OsiguraniciJSON",          Value = osiguraniciJSON }
};

// Izračun (ne kreira policu):
var rcPremija = client.PZOP5_IzracunajPremiju(p);
double ukupnaPremija = result.UkupnaPremija;

// Kreiranje police:
var rcPolica = client.PZOP5_SpremiPolicu(p);
dynamic d = JsonConvert.DeserializeObject<ExpandoObject>(rcPolica._Payload);
string brojPolice    = d.BrojPolice;
double ukupnaPremija = d.UkupnaPremija;
string errorMessage  = d.ErrorMessage;
```

> ⚠️ Varijanta pokrića za prtljagu se zanemaruje — vrijednost se izvlači iz `VrijednostPrtljage` kolone per osiguranik.

### PZOP5_IspisPolice

```csharp
Param[] p = new Param[] {
  new Param() { Name = "Id",   Value = loginGuid },
  new Param() { Name = "Broj", Value = "BROJ_POLICE" }
};
var rc = client.PZOP5_IspisPolice(p);
byte[] pdf = Convert.FromBase64String(rc._Payload);
```

---

## Partner metode (zajedničke za PZO i DZO)

| Metoda | Opis |
|---|---|
| `Partner_GetTip` | Šifarnik tipova partnera |
| `Partner_GetDrzave` | Šifarnik dostupnih država |
| `Partneri_UnosNovog` | Unos novog partnera/stranke |
| `Partner_Pretraga` | Pretraga po Sifra/OIB/Naziv |

### Partneri_UnosNovog — ključna polja

| Param Name | Primjer | Napomena |
|---|---|---|
| `Sektor` | `"1"` | Tip sektora |
| `OIB` | `"55164322948"` | |
| `Naziv` | `"Ime Prezime"` | |
| `Mjesto` | `"51000"` | Poštanski broj |
| `Ulica` | `"Morski Put 9234"` | |
| `Drzava` | `"HR"` | |
| `Spol` | `"M"` | `"M"` ili `"Z"` |
| `Ime` | `"Ime"` | |
| `Prezime` | `"Prezime"` | |
| `DatumRodjenja` | `"01.01.1978."` | Format DD.MM.YYYY. (s točkom na kraju) |

---

## Veza s implementacijom

- DZO: Paketi Komfor/Optimum/Ekskluziv + dječji — detalji u memory `project_uniqa_dzo_dobrovoljno.md`
- Proxy: isti kao Uniqa Auto (Oracle)
- Raw fajlovi: `raw/uniqa-zdravstveno/pzo-docs.docx`, `raw/uniqa-zdravstveno/dzo-docs.docx`
- Credentials: traži od Uniqa (Username/Password za AuthUser)
