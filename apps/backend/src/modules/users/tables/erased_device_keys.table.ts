import { BaseTable } from "@backend/db/base_table";

/**
 * Device keys (the `app_device` cookie, or `native-<id>`) of purged accounts.
 * A device that presents one is told to erase its local copy
 * (`account.localDataErasure`) and acknowledges. No user id is kept. Rows go
 * after 400 days (the cookie's life), on acknowledgement, or when anyone
 * signs in on that device key.
 */
export class ErasedDeviceKeyTable extends BaseTable {
	readonly table = "erased_device_keys";

	columns = this.setColumns((t) => ({
		deviceKey: t.string(64).primaryKey(),
		...t.timestampsAsNumbers(),
	}));
}
