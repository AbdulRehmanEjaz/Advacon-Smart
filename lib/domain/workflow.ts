export function assertReviewable(
  status: string,
  version: number,
  expectedVersion: number,
) {
  if (status !== 'WAITING' || version !== expectedVersion)
    throw new Error(
      'This submission has already been reviewed or changed. Refresh the page.',
    );
}
