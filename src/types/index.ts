export type UserProfile = {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Space = {
  id: string;
  name: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
};

export type SpaceMember = {
  id: string;
  space_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at?: string;
};

export type SpaceInvite = {
  id: string;
  space_id: string;
  email: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined";
  created_at?: string;
};

export type Restaurant = {
  id: string;
  space_id?: string | null;
  name: string;
  location: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
};

export type RatingCategory = "location" | "service" | "interior" | "menu" | "food" | "alcohol" | "prices";

export type Rating = {
  id: string;
  restaurant_id: string;
  user_id: string;
  display_name_snapshot: string;
  photo_url_snapshot: string | null;
  created_at?: string;
  updated_at?: string;
  location: number;
  menu: number;
  food: number;
  service: number;
  interior: number;
  alcohol: number;
  prices: number;
  overall_avg: number;
};
