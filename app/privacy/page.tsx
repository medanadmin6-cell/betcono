import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy | Pep Stake" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="3 November 2026"
      sections={[
        {
          heading: "What we collect",
          body: (
            <p>
              Your name, phone number, email if you give one, country, and the mobile money number
              you pay with. We also keep your bets, deposits and withdrawals, plus basic device and
              log data that helps us keep the site secure.
            </p>
          ),
        },
        {
          heading: "Why we use it",
          body: (
            <p>
              To run your account, settle bets, process payments, check identity and age, prevent
              fraud, and answer support requests. We do not sell your personal data.
            </p>
          ),
        },
        {
          heading: "Who we share it with",
          body: (
            <p>
              Payment providers who handle your deposits and withdrawals, SMS providers who send your
              codes, and hosting services that store our data. We also share data with authorities
              when the law requires it.
            </p>
          ),
        },
        {
          heading: "On your device",
          body: (
            <p>
              The site stores your session, bet slip and theme choice in your browser so they are
              still there when you come back. Clearing your browser data removes them.
            </p>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              We keep account and transaction records for as long as the law requires after your
              account closes, then delete them.
            </p>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <p>
              You can ask support for a copy of your data, to correct it, or to close your account.
              Some records we must keep by law even after the account closes.
            </p>
          ),
        },
      ]}
    />
  );
}
