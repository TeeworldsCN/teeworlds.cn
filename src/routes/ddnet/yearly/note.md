- [x] 今年得分/总得分
- [x] 跑图集中时间段
- [x] 跑图集中季度
- [x] 各种难度地图完成度
- [x] 深夜完成的某张图
- [ ] 在海外完成的记录
- [x] 今年完成时间最长的记录
- [x] 今年完成次数最多的图
- [x] 今年最佳队友
- [x] 今年参与过队伍人数最多的地图
- [x] 今年完成的分值最高的地图

select Map, Name, Time, Timestamp, Server from race where Name='TsFreddie'

// lowest time for all maps
SELECT Map, MIN(Time) AS LowestTime
FROM race
WHERE Name = 'TsFreddie'
GROUP BY Map;

// lowest time and points for all maps
SELECT m.Map, m.Points, MIN(r.Time) AS LowestTime
FROM maps m
LEFT JOIN race r ON m.Map = r.Map AND r.Name = 'TsFreddie'
GROUP BY m.Map HAVING MIN(r.Time) IS NOT NULL;