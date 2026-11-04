import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms | BetZone" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and conditions"
      updated="3 November 2026"
      sections={[
        {
          heading: "Who can play",
          body: (
            <p>
              You must be 18 or older and allowed to bet where you live. One account per person. We
              may ask you to confirm your identity before a withdrawal, and we close accounts opened
              by anyone under age.
            </p>
          ),
        },
        {
          heading: "Your account",
          body: (
            <p>
              Keep your login details private. Bets placed from your account are treated as yours.
              Tell us straight away if you think someone else has used it.
            </p>
          ),
        },
        {
          heading: "Placing bets",
          body: (
            <>
              <p>
                A bet is accepted once it shows in My Bets with a ticket number. Prices are checked
                again when you submit. If a price has moved, the bet is either refused or placed at
                the new price, depending on your slip settings.
              </p>
              <p>
                We may refuse or limit a bet, and we may void a bet struck at an obvious pricing
                error. If that happens, your stake is returned.
              </p>
            </>
          ),
        },
        {
          heading: "Settlement",
          body: (
            <p>
              Bets settle on the official result once the match is over. A postponed match is held
              and does not settle until it is played or we decide how to treat it. The full rules
              are in{" "}
              <Link href="/how-to-play" className="font-semibold text-[var(--accent)] underline">
                How to play
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Deposits, bonuses and withdrawals",
          body: (
            <p>
              Deposits and withdrawals go through mobile money in your own name. Bonus funds come with
              the conditions shown when they are offered. Withdrawals are checked before they are
              paid, and we may hold a payment while we look into unusual activity.
            </p>
          ),
        },
        {
          heading: "Responsible play",
          body: (
            <p>
              Only bet what you can afford to lose. If betting stops being fun, contact support and
              we will set limits on your account or close it.
            </p>
          ),
        },
        {
          heading: "Changes",
          body: (
            <p>
              We may update these terms. The date at the top shows the latest version, and continuing
              to use BetZone after a change means you accept it.
            </p>
          ),
        },
      ]}
    />
  );
}
