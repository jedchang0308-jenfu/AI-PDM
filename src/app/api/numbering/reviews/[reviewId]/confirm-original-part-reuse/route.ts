import { handleDrawingRevisionReviewAction } from "../../_review-action-handler";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  return handleDrawingRevisionReviewAction(request, context, "confirm_original_part_reuse");
}
