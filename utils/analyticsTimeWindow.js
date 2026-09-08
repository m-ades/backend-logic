/*
how far back "recent" activity metrics look, e.g. the student dashboard's
"Median (recent)" label. Also bounds the question_sessions scan so it can't
grow unboundedly as more terms of history accumulate.
*/
export const RECENT_TIME_WINDOW_DAYS = Number(process.env.RECENT_TIME_WINDOW_DAYS) || 30;
