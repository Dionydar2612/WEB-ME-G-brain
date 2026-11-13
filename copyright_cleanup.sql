-- G-Brain copyright-risk cleanup
-- IMPORTANT: Back up your Supabase database before running this migration.
-- Run only after schema.sql, facebook.sql, pokemon-news.sql and decks.sql.
-- This removes stored third-party image references and card flavor text from public-facing records.
-- It preserves card IDs, card names, deck lists, user accounts, tournament history and statistics.

begin;

-- Card artwork URLs and copied flavor text are not needed by the text-only Card Database.
update public.cards
set image_url = null,
    flavor = null,
    illustrator = null;

-- News thumbnails / image references are no longer rendered or fetched by G-Brain.
update public.news
set thumbnail_url = null,
    image_url = null,
    content = null;

-- Deck cover images are removed. Keep the deck list and strip image fields from each card JSON object.
update public.decklists
set cover_url = null,
    cards = coalesce(
      (
        select jsonb_agg(card_item - 'img' - 'image_url' - 'artwork')
        from jsonb_array_elements(
          case
            when jsonb_typeof(decklists.cards) = 'array' then decklists.cards
            else '[]'::jsonb
          end
        ) as items(card_item)
      ),
      '[]'::jsonb
    );

commit;

-- Verification queries
select count(*) as cards_with_image_url from public.cards where image_url is not null;
select count(*) as news_with_image_url from public.news where thumbnail_url is not null or image_url is not null;
select count(*) as decks_with_cover_url from public.decklists where cover_url is not null;
