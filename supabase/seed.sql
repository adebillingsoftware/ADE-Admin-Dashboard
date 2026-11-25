-- Optional non-secret seed data.
-- Roles, role-permission mapping, the inactive Monthly plan and default settings
-- are created by migrations 0002, 0003 and 0008. Do not seed production metrics,
-- commercial reward values, administrator passwords or secrets here.

-- Example: create a shop registration token after provisioning an administrator.
-- Use the API endpoint POST /api/v1/shops/registration-tokens (implement via admin UI)
-- or run `npm run token:registration` so only a hash is stored and the raw token is
-- displayed once to the operator.

select 'Arthi Digital Enterprises baseline migration complete. Configure a plan price and provision the first SUPER_ADMIN before connecting clients.' as status;
