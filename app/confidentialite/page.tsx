import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  robots: { index: false, follow: false },
};

export default function ConfidentialitePage() {
  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
        background: "#fff",
        color: "#1a1a1a",
        lineHeight: 1.6,
        minHeight: "100vh",
      }}
    >
        <main
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "48px 24px 96px",
          }}
        >
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>
            Politique de confidentialité
          </h1>
          <p style={{ color: "#666", marginBottom: 32 }}>
            Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>1. Introduction</h2>
            <p>
              La présente politique de confidentialité décrit la manière dont
              nous collectons, utilisons et protégeons les informations que
              vous nous communiquez lorsque vous utilisez notre application.
              Nous accordons une grande importance à la protection de vos
              données personnelles.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              2. Données collectées
            </h2>
            <p>
              Nous pouvons collecter des informations telles que votre nom,
              votre adresse e-mail, votre numéro de téléphone et toute autre
              information que vous nous fournissez volontairement dans le
              cadre de l'utilisation de nos services.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              3. Utilisation des données
            </h2>
            <p>
              Les données collectées sont utilisées exclusivement pour
              assurer le bon fonctionnement de nos services, répondre à vos
              demandes et, le cas échéant, vous contacter dans le cadre de la
              relation commerciale ou du service fourni.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              4. Partage des données
            </h2>
            <p>
              Nous ne vendons ni ne louons vos données personnelles à des
              tiers. Vos informations peuvent être partagées uniquement avec
              des prestataires techniques nécessaires au fonctionnement du
              service (hébergement, envoi d'e-mails, agenda), dans le strict
              respect de la confidentialité.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              5. Conservation des données
            </h2>
            <p>
              Vos données sont conservées pendant la durée nécessaire aux
              finalités pour lesquelles elles ont été collectées, ou
              conformément aux obligations légales applicables.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>6. Vos droits</h2>
            <p>
              Conformément à la réglementation en vigueur (RGPD), vous
              disposez d'un droit d'accès, de rectification, de suppression
              et d'opposition concernant vos données personnelles. Pour
              exercer ces droits, vous pouvez nous contacter à l'adresse
              indiquée ci-dessous.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>7. Sécurité</h2>
            <p>
              Nous mettons en œuvre des mesures techniques et
              organisationnelles appropriées afin de protéger vos données
              contre tout accès non autorisé, perte ou divulgation.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>8. Contact</h2>
            <p>
              Pour toute question relative à cette politique de
              confidentialité ou à l'utilisation de vos données, vous pouvez
              nous contacter à l'adresse suivante :{" "}
              <a href="mailto:contact@simplicicar.com">
                contact@simplicicar.com
              </a>
              .
            </p>
          </section>
        </main>
    </div>
  );
}
