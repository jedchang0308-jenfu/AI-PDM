import type { SubmissionDetail, SubmissionSummary } from "@/lib/types";

type ReuseCandidateRow = Pick<
  SubmissionSummary,
  "part_number" | "part_name" | "material" | "surface_finish" | "document_type" | "status"
> & {
  file_names: string | null;
};

type ReuseCandidateSource = Pick<
  SubmissionDetail,
  "part_number" | "part_name" | "material" | "surface_finish" | "document_type"
>;

export type ReuseScoringDependencies = {
  splitGroupConcat: (value: string | null) => string[];
  partFamily: (partNumber: string) => string;
  tokens: (value: string) => Set<string>;
  tokenOverlap: (left: Set<string>, right: Set<string>) => number;
  sameText: (left: string | null | undefined, right: string | null | undefined) => boolean;
  filenameOverlap: (sourceFiles: string[], candidateFiles: string[]) => {
    score: number;
    matchedFiles: string[];
  };
};

export function scoreDesignReuseCandidate<TRow extends ReuseCandidateRow>(
  source: ReuseCandidateSource,
  sourceFiles: string[],
  row: TRow,
  dependencies: ReuseScoringDependencies
): (Omit<TRow, "file_names"> & { score: number; match_reasons: string[]; matched_files: string[] }) | null {
  let score = 0;
  const reasons: string[] = [];
  const candidateFiles = dependencies.splitGroupConcat(row.file_names);
  const matchedFiles: string[] = [];

  if (
    dependencies.partFamily(source.part_number) &&
    dependencies.partFamily(source.part_number) === dependencies.partFamily(row.part_number)
  ) {
    score += 28;
    reasons.push(`Same part family ${dependencies.partFamily(row.part_number)}`);
  } else {
    const partOverlap = dependencies.tokenOverlap(dependencies.tokens(source.part_number), dependencies.tokens(row.part_number));
    if (partOverlap > 0) {
      score += Math.min(18, partOverlap * 9);
      reasons.push("Part number token match");
    }
  }

  const nameOverlap = dependencies.tokenOverlap(dependencies.tokens(source.part_name), dependencies.tokens(row.part_name));
  if (nameOverlap > 0) {
    score += Math.min(24, nameOverlap * 8);
    reasons.push("Part name keyword match");
  }

  if (dependencies.sameText(source.material, row.material)) {
    score += 18;
    reasons.push(`Same material ${row.material}`);
  }

  if (dependencies.sameText(source.surface_finish, row.surface_finish)) {
    score += 14;
    reasons.push(`Same surface finish ${row.surface_finish}`);
  }

  if (dependencies.sameText(source.document_type, row.document_type)) {
    score += 6;
    reasons.push(`Same document type ${row.document_type}`);
  }

  const fileOverlap = dependencies.filenameOverlap(sourceFiles, candidateFiles);
  if (fileOverlap.score > 0) {
    score += fileOverlap.score;
    reasons.push("Filename similarity");
    matchedFiles.push(...fileOverlap.matchedFiles);
  }

  if (row.status === "Released") {
    score += 4;
    reasons.push("Released design");
  }

  if (score < 24 || reasons.length === 0) return null;
  const { file_names: _fileNames, ...summary } = row;
  void _fileNames;
  return {
    ...summary,
    score,
    match_reasons: reasons,
    matched_files: matchedFiles
  };
}
