CREATE DATABASE collectionneurs;
\connect collectionneurs

CREATE TABLE users (
    id uuid  DEFAULT gen_random_uuid(),
    name text,
    canCreate boolean DEFAULT FALSE,
    profile_id char(21) CONSTRAINT must_be_different UNIQUE,
    PRIMARY KEY (id)
);


CREATE TABLE collections (
    id uuid DEFAULT gen_random_uuid(),
    name text,
    google_id char(76),
    description text,
    public boolean DEFAULT FALSE,
    user_id uuid REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY (id)
);


CREATE TABLE items (
    id uuid DEFAULT gen_random_uuid(),
    name varchar(26),
    description text,
    google_id char(98),
    collection_id uuid REFERENCES collections ON DELETE CASCADE,
    PRIMARY KEY (id)
);


CREATE TABLE tags (
    id uuid  DEFAULT gen_random_uuid(),
    label varchar(26),
    collection_id uuid REFERENCES collections ON DELETE CASCADE,
    PRIMARY KEY (id)
);


CREATE TABLE item_tags (
    tag_id  uuid REFERENCES tags ON DELETE CASCADE,
    item_id uuid REFERENCES items ON DELETE CASCADE
);
