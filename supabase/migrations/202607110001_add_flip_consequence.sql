alter table penalties
  drop constraint if exists penalties_consequence_choice_check;

alter table penalties
  add constraint penalties_consequence_choice_check
  check (consequence_choice in ('DRINK', 'FLIP', 'CHALLENGE'));
