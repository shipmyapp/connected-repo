import { suprClient } from "@backend/configs/suprsend.config";
import { userCreatedEventDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import { Event } from "@suprsend/node-sdk";
import { Static } from "pg-tbus";

export const userCreatedNotificationHandler = async (props: { input: Static<typeof userCreatedEventDef.schema> }) => {
	const { userId, name, email } = props.input;

	try {	
		// create a suprsend user instance for each user
		const suprUser = suprClient.user.get_instance(userId)
		suprUser.add_email(email)
		suprUser.set("name", name)
		await suprUser.save()


		const eventProps = {
			name
		} 

		const event_name = "USER CREATED"

		// Trigger user created event
		const event = new Event(userId, event_name, eventProps)
		const trigger = await suprClient.track_event(event)

		if (!trigger.success) {
			logger.error(
				{
					userId,
					error: trigger.message
				},
				"Failed to trigger user.created event to suprsend",
			);
			// Throwing here forces pg-tbus to re-run this based on your retry policy
      throw new Error(`SuprSend Trigger Failed: ${trigger.message}`);
		}

	} catch (error) {
		logger.error(
			{
				userId,
				error
			},
			"Error processing user.created event handler",
		);
		throw error; // Rethrow to ensure pg-tbus knows the handler failed
	}
}