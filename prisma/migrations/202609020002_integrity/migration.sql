CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit, approval and adjustment records are append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER approval_immutable BEFORE UPDATE OR DELETE ON "Approval" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER adjustment_immutable BEFORE UPDATE OR DELETE ON "Adjustment" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION protect_approved_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DailySubmission" WHERE id = OLD."submissionId" AND status = 'APPROVED') THEN
    RAISE EXCEPTION 'Approved quantities are immutable; append an adjustment';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER approved_item_immutable BEFORE UPDATE OR DELETE ON "DailySubmissionItem" FOR EACH ROW EXECUTE FUNCTION protect_approved_item();
CREATE FUNCTION protect_approved_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN RAISE EXCEPTION 'Approved submissions are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER approved_submission_immutable BEFORE UPDATE OR DELETE ON "DailySubmission" FOR EACH ROW EXECUTE FUNCTION protect_approved_submission();
ALTER TABLE "DailySubmissionItem" ADD CONSTRAINT positive_submitted_quantity CHECK (quantity > 0);
ALTER TABLE "Adjustment" ADD CONSTRAINT nonzero_correction CHECK (quantity <> 0);
ALTER TABLE "Block" ADD CONSTRAINT nonnegative_capacity CHECK (capacity IS NULL OR capacity >= 0);
ALTER TABLE "Block" ADD CONSTRAINT nonnegative_rows CHECK ("supportRows" IS NULL OR "supportRows" >= 0);
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT valid_schedule CHECK (finish >= start);
ALTER TABLE "ProjectSettings" ADD CONSTRAINT five_posts_per_row CHECK ("postTarget" = "rowTarget" * 5);
ALTER TABLE "WorkPackage" ADD CONSTRAINT valid_package_weight CHECK (weight >= 0 AND weight <= 100);
ALTER TABLE "Activity" ADD CONSTRAINT valid_activity_weight CHECK (weight >= 0 AND weight <= 100);
