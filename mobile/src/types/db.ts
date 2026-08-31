// Mirrors backend/supabase/migrations/0001_init.sql. Kept as plain hand
// -written types rather than generated ones for now — regenerate with the
// Supabase CLI (`supabase gen types typescript`) once the schema settles.

export type MeetingTime = {
  day: string | null; // M/T/W/H/F/S/U
  start: string | null; // 24h "HHMM", e.g. "1550" = 3:50 PM (no colon)
  end: string | null;
  campus: string | null;
  building: string | null;
  room: string | null;
};

export type Course = {
  id: string;
  term_year: number;
  term_code: number;
  campus: string;
  subject_code: string;
  subject_description: string | null;
  course_number: string;
  title: string;
  credits: number | null;
  core_codes: string[];
  updated_at: string;
};

export type Section = {
  id: string;
  course_id: string;
  term_year: number;
  term_code: number;
  index_number: string;
  section_number: string;
  instructors: string[];
  open: boolean;
  meeting_times: MeetingTime[];
  comments: string | null;
  updated_at: string;
};

export type ProfessorRmpMatch = {
  instructor_name: string;
  rmp_legacy_id: string | null;
  rmp_first_name: string | null;
  rmp_last_name: string | null;
  rmp_department: string | null;
  avg_rating: number | null;
  num_ratings: number | null;
  would_take_again_percent: number | null;
  difficulty: number | null;
  profile_url: string | null;
  confidence: number;
  match_method: "exact" | "fuzzy" | "none";
  updated_at: string;
};

export type Watch = {
  id: string;
  device_id: string;
  term_year: number;
  term_code: number;
  index_number: string;
  last_status: boolean;
  notified_at: string | null;
  created_at: string;
};

/** A section joined with its parent course and (if any) RMP match — the shape most screens work with. */
export type SectionWithCourse = Section & {
  courses: Course;
  professorRating?: ProfessorRmpMatch | null;
};
