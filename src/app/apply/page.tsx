import { Navbar } from "@/components/navbar";
import { ApplicationForm } from "@/components/application-form";

export default function ApplyPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Loan application</h1>
          <p className="mt-2 text-slate-600">
            Complete the form below to receive an instant risk assessment. All amounts are in
            Philippine Peso.
          </p>
        </div>
        <ApplicationForm />
      </main>
    </div>
  );
}
