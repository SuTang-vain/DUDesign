alter table auth_identities
  drop constraint if exists auth_identities_provider_check;

alter table auth_identities
  add constraint auth_identities_provider_check
  check (provider in ('password', 'oauth_google', 'oauth_github'));
