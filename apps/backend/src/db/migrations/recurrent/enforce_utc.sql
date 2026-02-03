DO $$
BEGIN
    -- Check if the current setting is not UTC
    IF NOT EXISTS (SELECT 1 FROM pg_settings WHERE name = 'TimeZone' AND setting = 'Etc/UTC') THEN
        -- Apply persistent change to the database
        EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET timezone TO ''Etc/UTC''';
        
        -- Apply to the current session immediately
        SET timezone TO 'Etc/UTC';
        
        RAISE NOTICE 'Database timezone updated to Etc/UTC.';
    END IF;
END
$$;