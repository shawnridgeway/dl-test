// 3p
import moment from "moment";
import knex from "knexClient";


export default async function getAvailabilities(date) {
  const numberOfDays = 7;
  const startDate = date;
  const endDate = moment(date).add(numberOfDays, "days").toDate();

  // Initialize the "availabilities" map with no slots filled 
  // for each day in the given timeframe
  const availabilities = new Map();
  for (let i = 0; i < numberOfDays; i++) {
    const tmpDate = moment(startDate).add(i, "days");
    availabilities.set(tmpDate.format("d"), {
      date: tmpDate.toDate(),
      slots: []
    });
  }

  // Retrieve all events that are reoccuring or within the timeframe
  const events = await knex
    .select("kind", "starts_at", "ends_at", "weekly_recurring")
    .from("events")
    .where(function() {
      this.where("weekly_recurring", true)
        .andWhere("starts_at", "<", +endDate)
    })
    .orWhere(function() {
      this.where("ends_at", ">=", +startDate)
        .andWhere("starts_at", "<", +endDate)
    });

  // Flatten array into:
  // 1) One-time events (as they are) and
  // 2) One event for each recurring event that occurs in the timeframe
  const oneTimeEvents = events
    .filter(event => !event.weekly_recurring)
  const eventSeries = events
    .filter(event => event.weekly_recurring);
  const recurringEvents = Array.from(availabilities.values())
    .map(availability => moment(availability.date).day())
    .map(dayOfWeek => eventSeries
      .filter(series => moment(series).day() === dayOfWeek))
    .flat();
  const flattenedEvents = [ ...oneTimeEvents, ...recurringEvents ];

  // Order by "kind", so that openenings are processed before appointments
  // in the next step below
  const sortedEvents = flattenedEvents
    .slice()
    .sort(event => event.kind === 'opening' ? -1 : 1);

  // Iterate through retrieved events
  for (const event of sortedEvents) {
    // For each 30 minute time slot within the event timeframe
    for (
      let slotDate = moment(event.starts_at);
      slotDate.isBefore(event.ends_at);
      slotDate.add(30, "minutes")
    ) {
      const day = availabilities.get(slotDate.format("d"));
      if (event.kind === "opening") {
        // Add opening 
        day.slots.push(slotDate.format("H:mm"));
      } else if (event.kind === "appointment") {
        // Remove opening 
        day.slots = day.slots.filter(
          slot => slot !== slotDate.format("H:mm")
        );
      }
    }
  }

  return Array.from(availabilities.values())
}
