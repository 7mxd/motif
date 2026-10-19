import { Card } from "@/components/Card";
import { TopBar } from "@/components/TopBar";
import { VariantSwitch } from "@/components/VariantSwitch";

export default function SettingsPage() {
  return (
    <main>
      <TopBar title="Settings" backHref="/" />
      <div className="flex max-w-2xl flex-col gap-8 px-4 py-6 md:px-8">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-heading">Appearance</h2>
          <Card>
            <VariantSwitch />
          </Card>
        </section>
      </div>
    </main>
  );
}
