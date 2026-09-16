"use client";

export type TrendWeek = {
  start: string;
  leads: number;
  booked: number;
  partial: boolean;
};

type WeeklyTrendProps = {
  weeks: TrendWeek[];
};

/** Enough finished weeks that a shape means something rather than nothing. */
const MIN_FINISHED_WEEKS = 3;

function label(start: string) {
  /* Parsed at noon so the date does not slide a day either way on a timezone
     whose midnight offset crosses the boundary. */
  return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

/**
 * Captured demand, week over week.
 *
 * There was no chart anywhere in this product — eighty-eight components and not
 * one shape. Every number an owner had was a number for right now, which is the
 * one thing a number cannot answer: whether it is getting better.
 *
 * Each bar is one week of leads, with the booked share filled in the brand
 * colour and the rest left hollow. So the height is how much work came in and
 * the fill is how much of it was closed, and a week where the phone rang and
 * nothing got booked looks different from a quiet week — which on any
 * single-series chart it would not.
 *
 * Two refusals, both of which cost something:
 *
 * The week in progress is drawn hatched and labelled, never as a finished bar.
 * A Tuesday morning against seven completed weeks reads as a cliff, and a chart
 * that shows a shop falling off one every Monday is worse than no chart.
 *
 * Under three finished weeks there is no chart at all, just a note saying how
 * much history exists. Three points is the floor for a direction. Drawing two
 * bars and calling it a trend is the thing every dashboard does, and it is how
 * an owner learns not to believe the screen.
 */
export function WeeklyTrend({ weeks }: WeeklyTrendProps) {
  const finished = weeks.filter((week) => !week.partial);
  const withWork = finished.filter((week) => week.leads > 0);

  if (withWork.length < MIN_FINISHED_WEEKS) {
    return (
      <div className="trend trend-thin">
        <p className="trend-note font-sans">
          {withWork.length === 0
            ? "No completed week of calls yet — the trend appears once there are three."
            : `${withWork.length} week${withWork.length === 1 ? "" : "s"} of history so far. The trend appears at three, so the shape means something.`}
        </p>
      </div>
    );
  }

  const ceiling = Math.max(...weeks.map((week) => week.leads), 1);

  /*
    Halved rather than fixed at four a side. A shop five weeks in has three
    finished weeks and two, and comparing its last four against "the four
    before" would have silently compared four weeks against one — then printed
    a number with a confident sentence under it. The label says which span it
    actually used.
  */
  const half = Math.floor(withWork.length / 2);
  const recent = withWork.slice(-half);
  const earlier = withWork.slice(0, half);
  const average = (rows: TrendWeek[]) =>
    rows.length ? rows.reduce((sum, r) => sum + r.leads, 0) / rows.length : null;
  const now = average(recent);
  const before = average(earlier);

  const change =
    now != null && before != null && before > 0
      ? Math.round(((now - before) / before) * 100)
      : null;

  return (
    <div className="trend">
      <div className="trend-head font-sans">
        <p className="trend-title os-own-color">
          Leads a week, and how many booked
        </p>
        {change != null ? (
          <p
            className={
              change >= 0
                ? "trend-delta is-up os-own-color"
                : "trend-delta os-own-color"
            }
          >
            {change >= 0 ? "+" : ""}
            {change}%{" "}
            <span>
              last {half} week{half === 1 ? "" : "s"} vs the {half} before
            </span>
          </p>
        ) : null}
      </div>

      <ol className="trend-bars">
        {weeks.map((week) => {
          const height = (week.leads / ceiling) * 100;
          const filled = week.leads ? (week.booked / week.leads) * 100 : 0;
          return (
            <li key={week.start} className="trend-week">
              {/*
                The bars get their own fixed-height track so the labels share a
                baseline. Sized against the week itself, the tallest bar filled
                the row and pushed its label a line below all the others.
              */}
              <div className="trend-bar-track">
                <div
                  className={
                    week.partial ? "trend-bar is-partial" : "trend-bar"
                  }
                  /* Floored so a zero week still draws something to hover,
                     rather than becoming a gap that reads as missing data. */
                  style={{ height: `${Math.max(2, height)}%` }}
                  title={`Week of ${label(week.start)} — ${week.leads} lead${week.leads === 1 ? "" : "s"}, ${week.booked} booked${week.partial ? " (week still running)" : ""}`}
                >
                  <span
                    className="trend-bar-booked"
                    style={{ height: `${filled}%` }}
                  />
                </div>
              </div>
              <span className="trend-week-label font-sans">
                {week.partial ? "now" : label(week.start)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="trend-legend font-sans">
        <span className="trend-key trend-key-booked" aria-hidden /> booked
        <span className="trend-key trend-key-open" aria-hidden /> not booked
        <span className="trend-key trend-key-partial" aria-hidden /> week still
        running
      </p>
    </div>
  );
}
