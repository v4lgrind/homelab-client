/** Raw torrent from qBittorrent /api/v2/torrents/info. */
export interface QbitTorrentRaw {
  hash: string;
  name: string;
  size: number;
  progress: number; // 0..1
  dlspeed: number; // bytes/s
  upspeed: number;
  eta: number; // seconds (8640000 ≈ infinity)
  state: string;
  ratio: number;
  num_seeds: number;
  num_leechs: number;
  category: string;
  added_on: number; // epoch seconds
  amount_left: number;
}

/** Raw global transfer info from /api/v2/transfer/info. */
export interface QbitTransfer {
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
  connection_status?: string;
}

export type TorrentStatus =
  | "downloading"
  | "seeding"
  | "stalled"
  | "paused"
  | "checking"
  | "error";

/** Normalised torrent for the UI. */
export interface Torrent {
  hash: string;
  name: string;
  state: string; // raw qBittorrent state
  status: TorrentStatus;
  progress: number; // 0..1
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number; // seconds
  ratio: number;
  numSeeds: number;
  numLeechs: number;
  category: string;
  addedOn: number;
}

export type TorrentFilter = "all" | "active" | "downloading" | "completed" | "paused";

export interface AddTorrentOptions {
  category?: string;
  paused?: boolean;
}
