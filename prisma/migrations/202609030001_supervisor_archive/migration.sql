ALTER TABLE "User" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT archived_user_inactive CHECK ("archivedAt" IS NULL OR active = false);

-- Audit references are intentionally not foreign keys. Protect them on delete too.
CREATE FUNCTION protect_user_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "userId" = OLD.id OR ("entityType" = 'User' AND "entityId" = OLD.id)) THEN
    RAISE EXCEPTION 'Users with audit history must be archived, not deleted';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER user_history_immutable BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION protect_user_history();
