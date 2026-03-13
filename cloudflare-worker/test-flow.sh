#!/bin/bash
# AS Direct — End-to-end test flow
# Redosljed: GetPodaci → GetQuote → GetMjesta → GenPolicy → SetPaymentStatus
#
# Zamijeni WORKER_URL s tvojim Cloudflare Worker URL-om
WORKER_URL="https://YOUR-WORKER.workers.dev"

echo "=========================================="
echo "1. GetPodaci (HUOMTR) — dohvat PS po OIB-u"
echo "=========================================="
# OIB 99526470374 = poznati PS1
# godinaRodjenja = godina rodjenja vlasnika vozila (npr. 1985)
curl -s -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "registracija": "ZG123AB",
    "snagaMotora": 85,
    "godinaRodjenja": 1985,
    "tipStranke": "1",
    "godinaProizvodnje": 2020,
    "oib": "99526470374"
  }' | jq .

echo ""
echo "=========================================="
echo "2. GetQuote — cijena i dostupni paketi"
echo "=========================================="
curl -s -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "registracija": "ZG123AB",
    "snagaMotora": 85,
    "godinaRodjenja": 1985,
    "tipStranke": "1",
    "godinaProizvodnje": 2020,
    "oib": "99526470374"
  }' | jq .

echo ""
echo "=========================================="
echo "3. GetMjesta — IN2 kodovi gradova"
echo "=========================================="
curl -s -X GET "$WORKER_URL/get-mjesta" | jq '.[] | select(.naziv | test("Zagreb"; "i")) | {id, naziv}'

echo ""
echo "=========================================="
echo "4. GenPolicy — kreiraj testnu policu"
echo "=========================================="
# Zamijeni 'mjesto' s IN2 kodom za Zagreb iz prethodnog koraka (npr. "040")
# Zamijeni 'premijskiStupanjAo' s PS dobivenim iz GetQuote (npr. 1)
curl -s -X POST "$WORKER_URL/gen-policy" \
  -H "Content-Type: application/json" \
  -d '{
    "vozilo": {
      "sasija": "WBA3A5C50CF256985",
      "proizvodac": "BMW",
      "model": "320d",
      "registracija": "ZG",
      "snagaMotora": 85,
      "godinaProizvodnje": 2020
    },
    "ugovaratelj": {
      "ime": "Ivan",
      "prezime": "Horvat",
      "oib": "99526470374",
      "datumRodjenja": "1985-01-01",
      "ulica": "Ilica",
      "kucniBroj": "1",
      "mjesto": "040",
      "spol": "M",
      "mobitel": "0911234567",
      "email": "ivan.horvat@test.hr",
      "marketinskaSuglasnost": false,
      "provjeraStranke": false,
      "tipStranke": "1"
    },
    "paketi": [
      { "code": "AO_BASIC", "selected": true }
    ],
    "premijskiStupanjAo": 1,
    "premijskiStupanjAk": 2
  }' | jq .

echo ""
echo "=========================================="
echo "5. SetPaymentStatus — aktiviraj policu"
echo "=========================================="
# Zamijeni BROJ_POLICE s brojPolice iz prethodnog koraka
BROJ_POLICE="325XXXXXXX"
curl -s -X POST "$WORKER_URL/set-payment-status" \
  -H "Content-Type: application/json" \
  -d "{
    \"brojPolice\": \"$BROJ_POLICE\",
    \"brojSasije\": \"WBA3A5C50CF256985\",
    \"paid\": true,
    \"storno\": false
  }" | jq '{brojPolice, brojZK, ima_policu_pdf: (.polica != null), ima_zk_pdf: (.ZK != null)}'

echo ""
echo "=========================================="
echo "6. GetDokumenti — predugovorna dokumentacija"
echo "=========================================="
curl -s -X GET "$WORKER_URL/get-dokumenti?faza=predugovorna" | jq .
