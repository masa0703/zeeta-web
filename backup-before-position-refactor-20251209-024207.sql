PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" VALUES(1,'0001_initial_schema.sql','2025-12-07 12:20:30');
INSERT INTO "d1_migrations" VALUES(2,'0002_add_node_relations.sql','2025-12-07 12:20:30');
INSERT INTO "d1_migrations" VALUES(3,'0003_remove_parent_id.sql','2025-12-09 02:10:02');
CREATE TABLE node_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_node_id INTEGER NOT NULL,
  child_node_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(parent_node_id, child_node_id)
);
INSERT INTO "node_relations" VALUES(40,5,6,'2025-12-09 02:12:45');
INSERT INTO "node_relations" VALUES(41,5,7,'2025-12-09 02:12:51');
INSERT INTO "node_relations" VALUES(42,5,8,'2025-12-09 02:13:07');
INSERT INTO "node_relations" VALUES(43,5,9,'2025-12-09 02:13:16');
INSERT INTO "node_relations" VALUES(44,10,11,'2025-12-09 02:13:22');
INSERT INTO "node_relations" VALUES(45,4,12,'2025-12-09 02:14:35');
INSERT INTO "node_relations" VALUES(46,4,13,'2025-12-09 02:14:42');
INSERT INTO "node_relations" VALUES(47,4,3,'2025-12-09 02:15:21');
INSERT INTO "node_relations" VALUES(48,4,28,'2025-12-09 02:15:38');
INSERT INTO "node_relations" VALUES(49,14,15,'2025-12-09 02:15:53');
INSERT INTO "node_relations" VALUES(50,14,16,'2025-12-09 02:15:58');
INSERT INTO "node_relations" VALUES(51,14,17,'2025-12-09 02:16:03');
INSERT INTO "node_relations" VALUES(52,14,18,'2025-12-09 02:16:14');
INSERT INTO "node_relations" VALUES(54,19,20,'2025-12-09 02:16:47');
INSERT INTO "node_relations" VALUES(55,20,21,'2025-12-09 02:17:05');
INSERT INTO "node_relations" VALUES(56,20,22,'2025-12-09 02:17:10');
INSERT INTO "node_relations" VALUES(57,26,25,'2025-12-09 02:17:18');
INSERT INTO "node_relations" VALUES(59,26,31,'2025-12-09 02:17:29');
INSERT INTO "node_relations" VALUES(60,26,32,'2025-12-09 02:17:43');
INSERT INTO "node_relations" VALUES(61,26,33,'2025-12-09 02:18:17');
INSERT INTO "node_relations" VALUES(62,26,35,'2025-12-09 02:18:24');
INSERT INTO "node_relations" VALUES(63,26,36,'2025-12-09 02:18:30');
INSERT INTO "node_relations" VALUES(64,26,34,'2025-12-09 02:18:37');
INSERT INTO "node_relations" VALUES(65,26,30,'2025-12-09 02:18:44');
INSERT INTO "node_relations" VALUES(66,26,29,'2025-12-09 02:18:56');
INSERT INTO "node_relations" VALUES(67,25,27,'2025-12-09 02:19:11');
INSERT INTO "node_relations" VALUES(68,31,27,'2025-12-09 02:19:22');
INSERT INTO "node_relations" VALUES(69,30,27,'2025-12-09 02:19:36');
CREATE TABLE IF NOT EXISTS "nodes" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  position INTEGER DEFAULT 0
);
INSERT INTO "nodes" VALUES(3,'ploom','','Admin','2025-12-07 12:24:33','2025-12-09 02:12:42',28);
INSERT INTO "nodes" VALUES(4,'電子タバコ','','Admin','2025-12-07 12:24:44','2025-12-09 02:17:57',1);
INSERT INTO "nodes" VALUES(5,'コンビニ',replace('# ここでは、コンビニを管理するのだ\n\n## そーなのだ\n\n### でもないのだ\n* およよよよ\n* aaaaa\n  * bbbbb\n    * ccc\n\n![けろけろ](https://baseec-img-mng.akamaized.net/images/item/origin/414d66bcf043fb18273ea548e5c53bd6.jpg?imformat=generic)','\n',char(10)),'Admin','2025-12-07 12:25:04','2025-12-09 02:17:57',2);
INSERT INTO "nodes" VALUES(6,'セブン','','Admin','2025-12-07 12:25:10','2025-12-09 02:12:42',2);
INSERT INTO "nodes" VALUES(7,'ローソン','','Admin','2025-12-07 12:25:16','2025-12-09 02:12:42',3);
INSERT INTO "nodes" VALUES(8,'ファミマ','','Admin','2025-12-07 12:25:32','2025-12-09 02:12:42',4);
INSERT INTO "nodes" VALUES(9,'ミニストップ','','Admin','2025-12-07 12:28:04','2025-12-09 02:12:42',5);
INSERT INTO "nodes" VALUES(10,'駅','','Admin','2025-12-07 12:47:33','2025-12-09 02:17:57',3);
INSERT INTO "nodes" VALUES(11,'江古田','','Admin','2025-12-07 12:47:54','2025-12-09 02:12:42',7);
INSERT INTO "nodes" VALUES(12,'アイコス','','Admin','2025-12-07 13:19:05','2025-12-09 02:12:42',8);
INSERT INTO "nodes" VALUES(13,'グロー','','Admin','2025-12-07 13:19:54','2025-12-09 02:12:42',9);
INSERT INTO "nodes" VALUES(14,'AI','','Admin','2025-12-08 02:21:39','2025-12-09 02:17:57',4);
INSERT INTO "nodes" VALUES(15,'ChatGPT','','Admin','2025-12-08 02:21:46','2025-12-09 02:16:39',1);
INSERT INTO "nodes" VALUES(16,'Gemini','','Admin','2025-12-08 02:21:55','2025-12-09 02:16:39',3);
INSERT INTO "nodes" VALUES(17,'Claude','','Admin','2025-12-08 02:22:08','2025-12-09 02:16:39',2);
INSERT INTO "nodes" VALUES(18,'Genspark','','Admin','2025-12-08 02:22:18','2025-12-09 02:16:39',0);
INSERT INTO "nodes" VALUES(19,'hogeプロジェクト','','Admin','2025-12-08 02:25:04','2025-12-09 02:17:57',5);
INSERT INTO "nodes" VALUES(20,'議事録','','Admin','2025-12-08 02:25:10','2025-12-09 02:12:42',16);
INSERT INTO "nodes" VALUES(21,'2025-1208 DevJP',replace('### 参加者\nクリス、石山、三上\n\n### 勤怠連絡\n\n### TODO\n\n# 状況\n* 石山\n  * ITA対応\n    * 計算処理、バグ対応\n    * 対応中\n  * 追加のテストケース\n    * VNでやるっぽい\n* クリス\n  * 12/8にupdateがあるので、それ待ち\n\n\n# xxxのAPI疎通\n伝票番号の赤電・黒電\n画面仕様書の修正\nJJ確認待ち\n実装完了\n今日12/4からテスト\n\nパラメータの型違い\nモックでは、パラメータはあまり見ていないため\n影響\n今回は、ITBの手前で確認したため、大きな影響はない\n対策\nモックで型チェックを入れる\n→このPJでやる必要はない\n\n# 雑談コーナー（三上）\nhttps://zeeta2.pages.dev/','\n',char(10)),'Admin','2025-12-08 02:25:37','2025-12-09 02:12:42',17);
INSERT INTO "nodes" VALUES(22,'2025-1205 Daily',replace('* ITB管理web\n* 管理webは一切できない\n* 実施できないテストケースをNTにする\n\nNoteに「管理Webが来てから実施」と記載する\n\n* 開発定例アジェンダ\n* 20251205_開発定例　12月05日 (金曜日)⋅午後16:00～17:00\n* 橋本さん、篠田さんへ\n* UI持ち込むか？確認させてください！\n* 早川さんへ\n* テスト実施についての方針共有の内容記載をお願いいたします。','\n',char(10)),'Admin','2025-12-08 02:30:31','2025-12-09 02:12:42',18);
INSERT INTO "nodes" VALUES(23,'＠＠使い方＠＠',replace('## 別の親の子供になる\nTree-view上で\n* 親を増やしたいノードを選択\n* command+c\n* 親にしたいノードを選択\n* commnad+v','\n',char(10)),'Admin','2025-12-08 02:40:58','2025-12-09 02:17:57',0);
INSERT INTO "nodes" VALUES(25,'aaaa','','Admin','2025-12-08 07:17:54','2025-12-09 02:20:09',2);
INSERT INTO "nodes" VALUES(26,'いろいろ実験','','Admin','2025-12-08 07:18:33','2025-12-09 02:17:57',6);
INSERT INTO "nodes" VALUES(27,'bbb','## test','Chris','2025-12-08 07:26:10','2025-12-09 02:19:58',0);
INSERT INTO "nodes" VALUES(28,'srg','','Admin','2025-12-08 07:57:54','2025-12-09 02:12:42',22);
INSERT INTO "nodes" VALUES(29,'eardgaerg','','Admin','2025-12-08 07:58:02','2025-12-09 02:20:09',0);
INSERT INTO "nodes" VALUES(30,'ccc','','Admin','2025-12-08 15:04:42','2025-12-09 02:20:09',3);
INSERT INTO "nodes" VALUES(31,'eee','','Admin','2025-12-08 15:12:28','2025-12-09 02:20:09',1);
INSERT INTO "nodes" VALUES(32,'ddd','','Admin','2025-12-09 00:33:08','2025-12-09 02:20:09',4);
INSERT INTO "nodes" VALUES(33,'1.あまがえる','','Admin','2025-12-09 00:33:41','2025-12-09 02:20:09',5);
INSERT INTO "nodes" VALUES(34,'4.がまがえる','','Admin','2025-12-09 00:33:54','2025-12-09 02:20:09',8);
INSERT INTO "nodes" VALUES(35,'2.殿様がえる','','Admin','2025-12-09 00:34:18','2025-12-09 02:20:09',6);
INSERT INTO "nodes" VALUES(36,'3.食用がえる','','Admin','2025-12-09 00:34:32','2025-12-09 02:20:09',7);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',3);
INSERT INTO "sqlite_sequence" VALUES('node_relations',69);
INSERT INTO "sqlite_sequence" VALUES('nodes',36);
CREATE INDEX idx_node_relations_parent ON node_relations(parent_node_id);
CREATE INDEX idx_node_relations_child ON node_relations(child_node_id);
CREATE INDEX idx_nodes_position ON nodes(position);
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
