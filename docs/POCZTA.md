# Poczta kontakt@groszaki.pl: przekierowanie do Gmaila i „Wyślij jako”

Cel: listy na `kontakt@groszaki.pl` trafiają do obecnego Gmaila, a odpowiadasz z Gmaila jako `kontakt@groszaki.pl`.
Koszt: 0 zł.

- **Odbiór**: ImprovMX (darmowe przekierowanie). Wystarczą rekordy MX i nie trzeba przenosić DNS do innej firmy.
- **Wysyłka**: Resend przez SMTP. Ta sama usługa jest w `PRODUKCJA.md` (punkt 3) przeznaczona do maili z rejestracji w Supabase.

Rekordy DNS dopisujesz u firmy, w której jest domena (panel DNS / „strefa DNS”).
**Nie ruszaj istniejących rekordów A i CNAME strony (GitHub Pages).** Jeśli są stare rekordy MX albo TXT z `v=spf1`
(np. poczta od rejestratora), usuń je albo zastąp poniższymi: rekord SPF może być w domenie tylko jeden.

## 1. Odbiór: ImprovMX

1. Załóż konto na improvmx.com, wpisz domenę `groszaki.pl`, a jako adres docelowy podaj swojego Gmaila.
2. W DNS domeny dodaj:

   | Typ | Nazwa | Wartość | Priorytet |
   |---|---|---|---|
   | MX | `@` (groszaki.pl) | `mx1.improvmx.com` | 10 |
   | MX | `@` | `mx2.improvmx.com` | 20 |
   | TXT | `@` | `v=spf1 include:spf.improvmx.com ~all` | – |

3. W ImprovMX dodaj alias `kontakt` (albo `*`, żeby łapać każdy adres @groszaki.pl).
4. Poczekaj, aż ImprovMX pokaże zielone znaczniki (zwykle kilka minut, czasem do kilku godzin), i wyślij próbny list
   z innej skrzynki na `kontakt@groszaki.pl`.

## 2. Wysyłka: Resend

1. Załóż konto na resend.com → **Domains → Add domain** → `groszaki.pl` (region: EU, jeśli jest do wyboru).
2. Resend pokaże rekordy do dopisania. Przepisz je dokładnie stamtąd, bo wartości są inne dla każdego konta. Zwykle to:
   - TXT `resend._domainkey` – klucz DKIM (długi ciąg `p=…`),
   - MX `send` – adres `feedback-smtp.….amazonses.com`, priorytet 10,
   - TXT `send` – `v=spf1 include:amazonses.com ~all`.

   Te rekordy dotyczą poddomeny `send`, więc nie kolidują z SPF z punktu 1.
3. Kliknij **Verify** i poczekaj na status *Verified*.
4. **API Keys → Create API key**, uprawnienie *Sending access*, tylko domena `groszaki.pl`. Skopiuj klucz (zaczyna się od `re_`).
   Dla Supabase utwórz potem osobny klucz.

## 3. Ochrona przed podszywaniem: DMARC

Dodaj jeszcze jeden rekord:

| Typ | Nazwa | Wartość |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:kontakt@groszaki.pl` |

`p=none` na start tylko zbiera raporty. Po kilku tygodniach bez problemów można zmienić na `p=quarantine`.

## 4. Gmail: „Wyślij jako”

1. Gmail → ⚙ → **Zobacz wszystkie ustawienia** → **Konta i importowanie** → *Wyślij jako* → **Dodaj inny adres e-mail**.
2. Nazwa: `Groszaki` (albo `Paweł Gąszczyk – Groszaki`), adres: `kontakt@groszaki.pl` → *Dalej*.
3. Serwer SMTP: `smtp.resend.com`, port `465`, **połączenie SSL**,
   nazwa użytkownika: `resend`, hasło: klucz API z punktu 2.4.
4. Gmail wyśle kod weryfikacyjny na `kontakt@groszaki.pl` – przyjdzie do tej samej skrzynki dzięki przekierowaniu. Wpisz go.
5. W tym samym miejscu zaznacz **„Odpowiadaj z tego samego adresu, na który wysłano wiadomość”**.

Test: wyślij list jako `kontakt@groszaki.pl` na inny adres i w odebranej wiadomości otwórz „Pokaż oryginał”.
Powinno być `DKIM: PASS` i `DMARC: PASS`.

## 5. Po uruchomieniu

Podmień `magicownia@gmail.com` na `kontakt@groszaki.pl` w `polityka.html` i `regulamin.html`.

Limity darmowych planów (liczba maili dziennie i miesięcznie) sprawdź na stronach ImprovMX i Resend, bo się zmieniają.
