use indexmap::IndexMap;
use rmp_serde::Deserializer;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter, Seek, Write};
use std::path::Path;
use tokio;
use unicode_segmentation::UnicodeSegmentation;
use varint_rs::VarintWriter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();

    let mut force_gen = false;
    let mut force_download = false;
    let mut skip_download = false;

    for arg in args {
        // force the file to be processed again
        if arg == "--force-gen" {
            force_gen = true;
        }

        // force the file to be downloaded again
        if arg == "--force-download" {
            force_download = true;
        }

        // skip downloading, also forces the file to be processed again
        if arg == "--skip-download" {
            skip_download = true;
        }
    }

    let url = "https://ddnet.org/players.msgpack";
    let tag_path = "cache/players.msgpack.tag";
    let msgpack_path = "cache/players.msgpack";
    let tmp_path = "cache/players.msgpack.tmp";

    let client = reqwest::Client::new();
    let head = client.head(url).send().await?;

    if !head.status().is_success() {
        eprintln!("Failed to fetch player list");
        return Ok(());
    }

    let mut up_to_date: bool = false;

    if !skip_download {
        let tag = head
            .headers()
            .get("etag")
            .or_else(|| head.headers().get("last-modified"));
        if let Some(tag) = tag {
            let tag_str = tag.to_str()?;

            if Path::new(tag_path).exists() {
                let cached_tag = std::fs::read_to_string(tag_path)?;
                if !force_download && cached_tag == tag_str {
                    up_to_date = true;
                }
            }

            if !up_to_date {
                println!("Downloading player list...");
                let response = client.get(url).send().await?;
                if response.status().is_success() {
                    let mut file = File::create(tmp_path)?;
                    let content = response.bytes().await?;
                    file.write_all(&content)?;

                    std::fs::rename(tmp_path, msgpack_path)?;
                    std::fs::write(tag_path, tag_str)?;
                }
            }
        } else {
            eprintln!("Failed to get player list tag");
            return Ok(());
        }
    }

    if up_to_date && !force_gen {
        return Ok(());
    }

    println!("Deserializing data...");
    let file = File::open(msgpack_path)?;
    let mut reader: BufReader<File> = BufReader::new(file);
    let mut deserializer = Deserializer::new(&mut reader);

    #[derive(Default)]
    struct RankInfo {
        points: u32,
        rank: u32,
    }

    struct PlayerInfo {
        points: RankInfo,
        rank: RankInfo,
        team: RankInfo,
        weekly: RankInfo,
        monthly: RankInfo,
        yearly: RankInfo,
    }

    impl PlayerInfo {
        pub fn new() -> Self {
            Self {
                points: RankInfo::default(),
                rank: RankInfo::default(),
                team: RankInfo::default(),
                weekly: RankInfo::default(),
                monthly: RankInfo::default(),
                yearly: RankInfo::default(),
            }
        }
    }

    let mut players: HashMap<String, PlayerInfo> = HashMap::new();

    let types: Result<Vec<String>, _> = Deserialize::deserialize(&mut deserializer);
    match types {
        Ok(data) => {
            drop(data);
        }
        Err(e) => {
            eprintln!("Failed to deserialize types: {:?}", e);
            return Ok(());
        }
    }

    let maps: Result<IndexMap<String, Vec<(String, i32, i32)>>, _> =
        Deserialize::deserialize(&mut deserializer);
    match maps {
        Ok(data) => {
            drop(data);
        }
        Err(e) => {
            eprintln!("Failed to deserialize maps: {:?}", e);
            return Ok(());
        }
    }

    let total_points: Result<i32, _> = Deserialize::deserialize(&mut deserializer);
    match total_points {
        Ok(_) => {
            // unused
        }
        Err(e) => {
            eprintln!("Failed to deserialize total_points: {:?}", e);
            return Ok(());
        }
    }

    let points_ranks: Result<Vec<(String, u32)>, _> = Deserialize::deserialize(&mut deserializer);
    match points_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).points =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize points_ranks: {:?}", e);
            return Ok(());
        }
    }

    let weekly_points_ranks: Result<Vec<(String, u32)>, _> =
        Deserialize::deserialize(&mut deserializer);
    match weekly_points_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).weekly =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize weekly_points_ranks: {:?}", e);
            return Ok(());
        }
    }

    let monthly_points_ranks: Result<Vec<(String, u32)>, _> =
        Deserialize::deserialize(&mut deserializer);
    match monthly_points_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).monthly =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize monthly_points_ranks: {:?}", e);
            return Ok(());
        }
    }

    let yearly_points_ranks: Result<Vec<(String, u32)>, _> =
        Deserialize::deserialize(&mut deserializer);
    match yearly_points_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).yearly =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize yearly_points_ranks: {:?}", e);
            return Ok(());
        }
    }

    let teamrank_ranks: Result<Vec<(String, u32)>, _> = Deserialize::deserialize(&mut deserializer);
    match teamrank_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).team =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize teamrank_ranks: {:?}", e);
            return Ok(());
        }
    }

    let rank_ranks: Result<Vec<(String, u32)>, _> = Deserialize::deserialize(&mut deserializer);
    match rank_ranks {
        Ok(data) => {
            let mut i = 1;
            for (name, points) in data {
                players.entry(name).or_insert_with(PlayerInfo::new).rank =
                    RankInfo { points, rank: i };
                i += 1;
            }
        }
        Err(e) => {
            eprintln!("Failed to deserialize rank_ranks: {:?}", e);
            return Ok(());
        }
    }

    // Skip this serealization, since it is not used

    // let server_ranks: Result<
    //     IndexMap<
    //         String,
    //         (
    //             i32,
    //             Vec<(String, i32)>,
    //             Vec<(String, i32)>,
    //             Vec<(String, i32)>,
    //         ),
    //     >,
    //     _,
    // > = Deserialize::deserialize(&mut deserializer);
    // match server_ranks {
    //     Ok(data) => {
    //         drop(data);
    //     }
    //     Err(e) => {
    //         eprintln!("Failed to deserialize server_ranks: {:?}", e);
    //         return Ok(());
    //     }
    // }

    println!("Processing player data...");
    // lowercase all names
    let mut data: Vec<(String, String, PlayerInfo)> = players
        .into_iter()
        .map(|(name, info)| (name.to_lowercase(), name, info))
        .collect();

    // sort by lowercase name
    data.sort_by(|a, b| a.0.cmp(&b.0));

    // write to file
    let mut file = File::create("cache/points_ranks_by_name.bin.tmp")?;
    let mut writer = BufWriter::new(&mut file);
    let mut pointers: Vec<u32> = Vec::new();
    let num_ranks = data.len() as u32;

    let version: u32 = 1;

    writer.write_all(&version.to_le_bytes())?; // 0
    writer.write_all(&total_points.unwrap().to_le_bytes())?; // 4
    writer.write_all(&num_ranks.to_le_bytes())?; // 8
                                                 // 12 - cache_pointer
                                                 // 16 - data start

    writer.seek(std::io::SeekFrom::Start(
        u64::from(num_ranks) * size_of::<u32>() as u64 + 5 * size_of::<u32>() as u64,
    ))?;

    // precalculate top10 for prefixes with more than 10000 entries
    struct Top10Cache {
        count: u32,
        top10: Vec<(String, u32)>,
    }

    impl Top10Cache {
        pub fn new() -> Self {
            Self {
                count: 0,
                top10: Vec::new(),
            }
        }
    }

    let mut top10: IndexMap<String, Top10Cache> = IndexMap::new();

    // common prefixes
    let prefixes: Vec<&str> = vec!["(1)", "[d]"];
    let mut last_prefix: Option<&str> = None;

    for (_, rank) in data.iter().enumerate() {
        // record pointer position
        let position = writer.stream_position()?;
        pointers.push(u32::try_from(position).unwrap());

        // write player info
        let name_bytes = rank.1.as_bytes();
        let name_len = u8::try_from(name_bytes.len()).unwrap();

        writer.write_all(&name_len.to_le_bytes())?;
        writer.write_all(name_bytes)?;
        writer.write_u32_varint(rank.2.points.points)?;
        writer.write_u32_varint(rank.2.points.rank)?;
        writer.write_u32_varint(rank.2.rank.points)?;
        writer.write_u32_varint(rank.2.rank.rank)?;
        writer.write_u32_varint(rank.2.team.points)?;
        writer.write_u32_varint(rank.2.team.rank)?;
        writer.write_u32_varint(rank.2.weekly.points)?;
        writer.write_u32_varint(rank.2.weekly.rank)?;
        writer.write_u32_varint(rank.2.monthly.points)?;
        writer.write_u32_varint(rank.2.monthly.rank)?;
        writer.write_u32_varint(rank.2.yearly.points)?;
        writer.write_u32_varint(rank.2.yearly.rank)?;

        // cache prefix data
        let prefix = rank.0.graphemes(true).next();
        if !prefix.is_none() {
            let prefix = prefix.unwrap();
            let top10_ranks = top10
                .entry(prefix.to_string())
                .or_insert_with(Top10Cache::new);
            top10_ranks.count += 1;
            top10_ranks
                .top10
                .push((rank.1.clone(), rank.2.points.points));
            top10_ranks.top10.sort_by(|a, b| b.1.cmp(&a.1));

            if top10_ranks.top10.len() > 10 {
                top10_ranks.top10.pop();
            }

            let next = rank.0[prefix.len()..].graphemes(true).next();
            if !next.is_none() {
                let second = next.unwrap();
                let prefix = format!("{prefix}{second}");
                let top10_ranks = top10
                    .entry(prefix.to_string())
                    .or_insert_with(Top10Cache::new);
                top10_ranks.count += 1;
                top10_ranks
                    .top10
                    .push((rank.1.clone(), rank.2.points.points));
                top10_ranks.top10.sort_by(|a, b| b.1.cmp(&a.1));

                if top10_ranks.top10.len() > 10 {
                    top10_ranks.top10.pop();
                }
            }

            let common_prefix = prefixes
                .iter()
                .find(|prefix| rank.0.starts_with(&prefix.to_string()));

            if !common_prefix.is_none() {
                let prefix = common_prefix.unwrap();
                let top10_ranks = top10
                    .entry(prefix.to_string())
                    .or_insert_with(Top10Cache::new);
                top10_ranks.count += 1;
                top10_ranks
                    .top10
                    .push((rank.1.clone(), rank.2.points.points));
                top10_ranks.top10.sort_by(|a, b| b.1.cmp(&a.1));

                if top10_ranks.top10.len() > 10 {
                    top10_ranks.top10.pop();
                }

                let next = rank.0[prefix.len()..].graphemes(true).next();
                if !next.is_none() {
                    let next = next.unwrap();
                    let prefix = format!("{prefix}{next}");
                    let top10_ranks = top10
                        .entry(prefix.to_string())
                        .or_insert_with(Top10Cache::new);
                    top10_ranks.count += 1;
                    top10_ranks
                        .top10
                        .push((rank.1.clone(), rank.2.points.points));
                    top10_ranks.top10.sort_by(|a, b| b.1.cmp(&a.1));

                    if top10_ranks.top10.len() > 10 {
                        top10_ranks.top10.pop();
                    }

                    let next = rank.0[prefix.len()..].graphemes(true).next();
                    if !next.is_none() {
                        let next = next.unwrap();
                        let prefix = format!("{prefix}{next}");
                        let top10_ranks = top10
                            .entry(prefix.to_string())
                            .or_insert_with(Top10Cache::new);
                        top10_ranks.count += 1;
                        top10_ranks
                            .top10
                            .push((rank.1.clone(), rank.2.points.points));
                        top10_ranks.top10.sort_by(|a, b| b.1.cmp(&a.1));

                        if top10_ranks.top10.len() > 10 {
                            top10_ranks.top10.pop();
                        }
                    }
                }
            }
        }

        // TODO: there is definitely a better way to do this
        if (last_prefix != prefix) && prefix.is_some() {
            last_prefix = prefix;
            let len = top10.len() as i64;
            let mut i = len - 1;
            while i >= 0 {
                let index = usize::try_from(i)?;
                let item = top10.get_index(index).unwrap();
                if item.1.count < 10000 {
                    top10.shift_remove_index(index);
                }
                i -= 1;
            }
        }
    }

    // clear top10 cache one last time
    let len = top10.len() as i64;
    let mut i = len - 1;
    while i >= 0 {
        let index = usize::try_from(i)?;
        let item = top10.get_index(index).unwrap();
        if item.1.count < 10000 {
            top10.shift_remove_index(index);
        }
        i -= 1;
    }

    let cache_pointer = writer.stream_position()?;
    writer.write_all(&u32::try_from(top10.len())?.to_le_bytes())?;
    for (prefix, cache) in top10.iter() {
        let bytes = prefix.as_bytes();
        writer.write_all(&u8::try_from(bytes.len())?.to_le_bytes())?;
        writer.write_all(bytes)?;
        writer.write_all(&u8::try_from(cache.top10.len())?.to_le_bytes())?;
        for (name, points) in cache.top10.iter() {
            let bytes = name.as_bytes();
            writer.write_all(&u8::try_from(bytes.len())?.to_le_bytes())?;
            writer.write_all(bytes)?;
            writer.write_u32_varint(*points)?;
        }
    }

    // write pointers
    writer.seek(std::io::SeekFrom::Start(3 * size_of::<u32>() as u64))?;
    writer.write_all(&u32::try_from(cache_pointer)?.to_le_bytes())?; // 12
    for pointer in pointers {
        writer.write_all(&pointer.to_le_bytes())?;
    }

    drop(writer);
    std::fs::rename(
        "cache/points_ranks_by_name.bin.tmp",
        "cache/points_ranks_by_name.bin",
    )?;
    println!("Done!");
    Ok(())
}
