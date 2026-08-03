ALTER TABLE "projects"
    ADD CONSTRAINT "chk_projects_slug"
    CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
