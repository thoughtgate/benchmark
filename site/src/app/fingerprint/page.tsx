import type { Metadata } from 'next';
import { getLatestRun } from '@/lib/data';
import { buildFingerprintMatrix } from '@/lib/fingerprint';
import { FingerprintMatrix } from '@/components/FingerprintMatrix';

export const metadata: Metadata = {
  title: 'Evasion Technique Fingerprint',
  description: 'Which attacks work on which LLMs? Surface x technique matrix showing tier results per model.',
};

export default function FingerprintPage() {
  const run = getLatestRun();

  if (!run) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold">Technique Fingerprint</h1>
        <p className="mt-4 text-gray-500">No benchmark data available yet.</p>
      </div>
    );
  }

  const matrixData = buildFingerprintMatrix(run.models);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Evasion Technique Fingerprint</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">
          Which delivery surfaces and evasion techniques succeed against which models?
          Each cell shows the worst-case tier across scenarios using that surface + technique combination.
        </p>
      </div>
      <FingerprintMatrix matrixData={matrixData} models={run.models} />
    </div>
  );
}
