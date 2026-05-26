

import { parseAlertEmail } from "../lib/scan";

// Sample LBC alert email (synthetic but representative of LBC's actual structure).
const lbcMail = `
<html><body>
<table>
  <tr><td>
    <a href="https://www.leboncoin.fr/voitures/2812345678.htm?at_emailtype=newsletter&utm_source=alerts&at_medium=email">
      <img src="https://images.leboncoin.fr/api/v1/lbcpb1/images/abc.jpg" />
    </a>
    <h3>Volkswagen Golf 7 1.6 TDI 110 Confortline</h3>
    <span>14 990 €</span>
    <span>85 000 km · 2017 · Diesel</span>
    <span>75017 Paris</span>
    <span>Particulier</span>
  </td></tr>
  <tr><td>
    <a href="https://www.leboncoin.fr/ad/voitures/2933334444?utm_source=alerts">
      <img src="https://images.leboncoin.fr/api/v1/lbcpb1/images/xyz.jpg" />
    </a>
    <h3>Mercedes Classe A 200 d AMG Line</h3>
    <span>21 500 €</span>
    <span>62 000 km · 2019</span>
    <span>92100 Boulogne-Billancourt</span>
    <span>Pro</span>
    <span>Garage Mercedes Boulogne</span>
  </td></tr>
  <tr><td>
    <a href="https://www.leboncoin.fr/voitures/2999887766.htm">Toyota CHR Hybride 122h Dynamic</a>
    <span>19 990 €</span>
    <span>78 000 km · 2018 · Hybride</span>
    <span>69001 Lyon</span>
    <span>Particulier</span>
  </td></tr>
</table>
</body></html>
`;

const lacentraleMail = `
<html><body>
<div>
  <a href="https://www.lacentrale.fr/auto-occasion-annonce-87102345678.html?utm_campaign=alert">
    <img src="https://photos.lacentrale.fr/abc.jpg" />
  </a>
  <p>Audi A3 Sportback 35 TFSI 150 S line</p>
  <p>23 990 €</p>
  <p>54 000 km</p>
  <p>2020</p>
  <p>Paris (75)</p>
  <p>Particulier</p>
</div>
<div>
  <a href="https://www.lacentrale.fr/auto-occasion-annonce-87199998888.html">
    <img src="https://photos.lacentrale.fr/def.jpg" />
  </a>
  <p>Tesla Model 3 Long Range Dual Motor</p>
  <p>32 500 €</p>
  <p>45 000 km</p>
  <p>2021</p>
  <p>13001 Marseille</p>
  <p>Concession Tesla</p>
</div>
</body></html>
`;

const paruvenduMail = `
<html><body>
<a href="https://www.paruvendu.fr/a/voiture-occasion/citroen/c4/12345678?xtor=AL-1">BYD Atto 3 Comfort</a>
<img src="https://img.paruvendu.fr/bydatto.jpg" />
<span>27 990 €</span>
<span>15 000 km</span>
<span>2023</span>
<span>33000 Bordeaux</span>
<span>Particulier</span>
</body></html>
`;

function show(label: string, html: string) {
  console.log("\n" + "=".repeat(60));
  console.log(label);
  console.log("=".repeat(60));
  const out = parseAlertEmail({ html });
  console.log(`Found ${out.length} listings:\n`);
  for (const x of out) {
    console.log(`  Platform : ${x.platform}`);
    console.log(`  URL      : ${x.url}`);
    console.log(`  Title    : ${x.title}`);
    console.log(`  Brand    : ${x.brand}`);
    console.log(`  Price    : ${x.price_eur} €`);
    console.log(`  Km       : ${x.km}`);
    console.log(`  Year     : ${x.year}`);
    console.log(`  Location : ${x.location}`);
    console.log(`  Image    : ${x.image_url}`);
    console.log(`  Pro      : ${x.is_pro}`);
    console.log("  ---");
  }
}

show("LBC sample (3 listings expected: VW Golf, Mercedes A, Toyota CHR)", lbcMail);
show("LaCentrale sample (2 listings expected: Audi A3, Tesla M3)", lacentraleMail);
show("ParuVendu sample (1 listing expected: BYD Atto 3)", paruvenduMail);
