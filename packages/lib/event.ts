import type { TFunction } from "i18next";
import z from "zod";

import { guessEventLocationType } from "@calcom/app-store/locations";
import type { Prisma } from "@calcom/prisma/client";

export const nameObjectSchema = z.object({
  firstName: z.string(),
  lastName: z.string().optional(),
});

function parseName(name: z.infer<typeof nameObjectSchema> | string | undefined) {
  if (typeof name === "string") return name;
  else if (typeof name === "object" && nameObjectSchema.parse(name))
    return `${name.firstName} ${name.lastName}`.trim();
  else return "Nameless";
}

export type EventNameObjectType = {
  attendeeName: z.infer<typeof nameObjectSchema> | string;
  eventType: string;
  eventName?: string | null;
  teamName?: string | null;
  host: string;
  location?: string | null;
  eventDuration: number;
  bookingFields?: Prisma.JsonObject | null;
  t: TFunction;
};

export function getEventName(eventNameObj: EventNameObjectType, forAttendeeView = false) {
  const attendeeName = parseName(eventNameObj.attendeeName);

  if (!eventNameObj.eventName)
    return eventNameObj.t("event_between_users", {
      eventName: eventNameObj.eventType,
      host: eventNameObj.teamName || eventNameObj.host,
      attendeeName,
      interpolation: {
        escapeValue: false,
      },
    });

  let eventName = eventNameObj.eventName;
  let locationString = eventNameObj.location || "";

  if (eventNameObj.eventName.includes("{Location}") || eventNameObj.eventName.includes("{LOCATION}")) {
    const eventLocationType = guessEventLocationType(eventNameObj.location);
    if (eventLocationType) {
      locationString = eventLocationType.label;
    }
    eventName = eventName.replace("{Location}", locationString);
    eventName = eventName.replace("{LOCATION}", locationString);
  }

  let dynamicEventName = eventName
    // Need this for compatibility with older event names
    .replaceAll("{Event type title}", eventNameObj.eventType)
    .replaceAll("{Scheduler}", attendeeName)
    .replaceAll("{Organiser}", eventNameObj.host)
    .replaceAll("{Organiser first name}", eventNameObj.host.split(" ")[0])
    .replaceAll("{USER}", attendeeName)
    .replaceAll("{ATTENDEE}", attendeeName)
    .replaceAll("{HOST}", eventNameObj.host)
    .replaceAll("{HOST/ATTENDEE}", forAttendeeView ? eventNameObj.host : attendeeName)
    .replaceAll("{Event duration}", `${String(eventNameObj.eventDuration)} mins`)
    .replaceAll(
      "{Scheduler first name}",
      attendeeName === eventNameObj.t("scheduler") ? "{Scheduler first name}" : attendeeName.split(" ")[0]
    );

  const { bookingFields } = eventNameObj || {};
  const { name } = bookingFields || {};

  if (name && typeof name === "object" && !Array.isArray(name) && typeof name.lastName === "string") {
    dynamicEventName = dynamicEventName.replaceAll("{Scheduler last name}", name.lastName.toString());
  }

  const customInputvariables = dynamicEventName.match(/\{(.+?)}/g)?.map((variable) => {
    return variable.replace("{", "").replace("}", "");
  });

  customInputvariables?.forEach((variable) => {
    if (!eventNameObj.bookingFields) return;

    const bookingFieldValue = eventNameObj.bookingFields[variable as keyof typeof eventNameObj.bookingFields];

    if (bookingFieldValue) {
      let fieldValue;

      if (typeof bookingFieldValue === "object") {
        if ("value" in bookingFieldValue) {
          fieldValue = bookingFieldValue.value?.toString();
        } else if (variable === "name" && "firstName" in bookingFieldValue) {
          const lastName = "lastName" in bookingFieldValue ? bookingFieldValue.lastName : "";
          fieldValue = `${bookingFieldValue.firstName} ${lastName}`.trim();
        }
      } else {
        fieldValue = bookingFieldValue.toString();
      }

      dynamicEventName = dynamicEventName.replace(`{${variable}}`, fieldValue || "");
    }
  });

  return dynamicEventName;
}

export const validateCustomEventName = (value: string, bookingFields?: Prisma.JsonObject | null) => {
  let customInputVariables: string[] = [];
  if (bookingFields) {
    customInputVariables = Object.keys(bookingFields).map((customInput) => {
      return `{${customInput}}`;
    });
  }

  const validVariables = customInputVariables.concat([
    "{Event type title}",
    "{Organiser}",
    "{Scheduler}",
    "{Location}",
    "{Organiser first name}",
    "{Scheduler first name}",
    "{Scheduler last name}",
    "{Event duration}",
    //allowed for fallback reasons
    "{LOCATION}",
    "{HOST/ATTENDEE}",
    "{HOST}",
    "{ATTENDEE}",
    "{USER}",
  ]);
  const matches = value.match(/\{([^}]+)\}/g);
  if (matches?.length) {
    for (const item of matches) {
      if (!validVariables.includes(item)) {
        return item;
      }
    }
  }

  return true;
};
