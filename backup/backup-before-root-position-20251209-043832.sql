PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" VALUES(1,'0001_initial_schema.sql','2025-12-07 12:20:30');
INSERT INTO "d1_migrations" VALUES(2,'0002_add_node_relations.sql','2025-12-07 12:20:30');
INSERT INTO "d1_migrations" VALUES(3,'0003_remove_parent_id.sql','2025-12-09 02:10:02');
INSERT INTO "d1_migrations" VALUES(4,'0004_add_position_to_relations.sql','2025-12-09 02:42:28');
CREATE TABLE node_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_node_id INTEGER NOT NULL,
  child_node_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, position INTEGER DEFAULT 0,
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(parent_node_id, child_node_id)
);
INSERT INTO "node_relations" VALUES(70,4,3,'2025-12-09 02:45:27',0);
INSERT INTO "node_relations" VALUES(71,5,6,'2025-12-09 02:45:33',0);
INSERT INTO "node_relations" VALUES(72,5,7,'2025-12-09 02:45:46',1);
INSERT INTO "node_relations" VALUES(73,5,8,'2025-12-09 02:45:53',2);
INSERT INTO "node_relations" VALUES(74,5,9,'2025-12-09 02:45:58',3);
INSERT INTO "node_relations" VALUES(75,10,11,'2025-12-09 02:46:06',0);
INSERT INTO "node_relations" VALUES(76,4,12,'2025-12-09 02:46:16',1);
INSERT INTO "node_relations" VALUES(77,4,13,'2025-12-09 02:46:22',2);
INSERT INTO "node_relations" VALUES(78,14,15,'2025-12-09 02:46:33',0);
INSERT INTO "node_relations" VALUES(79,14,16,'2025-12-09 02:46:40',1);
INSERT INTO "node_relations" VALUES(80,14,17,'2025-12-09 02:50:34',2);
INSERT INTO "node_relations" VALUES(81,14,18,'2025-12-09 02:50:40',3);
INSERT INTO "node_relations" VALUES(82,19,20,'2025-12-09 02:50:51',0);
INSERT INTO "node_relations" VALUES(83,20,21,'2025-12-09 02:50:57',0);
INSERT INTO "node_relations" VALUES(84,20,22,'2025-12-09 02:51:02',1);
INSERT INTO "node_relations" VALUES(85,4,28,'2025-12-09 02:51:56',3);
CREATE TABLE IF NOT EXISTS "nodes" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "nodes" VALUES(3,'ploom','','Admin','2025-12-07 12:24:33','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(4,'電子タバコ','','Admin','2025-12-07 12:24:44','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(5,'コンビニ',replace('# ここでは、コンビニを管理するのだ\n\n## そーなのだ\n\n### でもないのだ\n* およよよよ\n* aaaaa\n  * bbbbb\n    * ccc\n\n![けろけろ](https://baseec-img-mng.akamaized.net/images/item/origin/414d66bcf043fb18273ea548e5c53bd6.jpg?imformat=generic)','\n',char(10)),'Admin','2025-12-07 12:25:04','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(6,'セブン','','Admin','2025-12-07 12:25:10','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(7,'ローソン','','Admin','2025-12-07 12:25:16','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(8,'ファミマ','','Admin','2025-12-07 12:25:32','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(9,'ミニストップ','','Admin','2025-12-07 12:28:04','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(10,'駅','','Admin','2025-12-07 12:47:33','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(11,'江古田','','Admin','2025-12-07 12:47:54','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(12,'アイコス','','Admin','2025-12-07 13:19:05','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(13,'グロー','','Admin','2025-12-07 13:19:54','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(14,'AI','','Admin','2025-12-08 02:21:39','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(15,'ChatGPT','','Admin','2025-12-08 02:21:46','2025-12-09 02:16:39');
INSERT INTO "nodes" VALUES(16,'Gemini','','Admin','2025-12-08 02:21:55','2025-12-09 02:16:39');
INSERT INTO "nodes" VALUES(17,'Claude','','Admin','2025-12-08 02:22:08','2025-12-09 02:16:39');
INSERT INTO "nodes" VALUES(18,'Genspark','','Admin','2025-12-08 02:22:18','2025-12-09 02:16:39');
INSERT INTO "nodes" VALUES(19,'hogeプロジェクト','','Admin','2025-12-08 02:25:04','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(20,'議事録','','Admin','2025-12-08 02:25:10','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(21,'2025-1208 DevJP',replace('### 参加者\nクリス、石山、三上\n\n### 勤怠連絡\n\n### TODO\n\n# 状況\n* 石山\n  * ITA対応\n    * 計算処理、バグ対応\n    * 対応中\n  * 追加のテストケース\n    * VNでやるっぽい\n* クリス\n  * 12/8にupdateがあるので、それ待ち\n\n\n# xxxのAPI疎通\n伝票番号の赤電・黒電\n画面仕様書の修正\nJJ確認待ち\n実装完了\n今日12/4からテスト\n\nパラメータの型違い\nモックでは、パラメータはあまり見ていないため\n影響\n今回は、ITBの手前で確認したため、大きな影響はない\n対策\nモックで型チェックを入れる\n→このPJでやる必要はない\n\n# 雑談コーナー（三上）\nhttps://zeeta2.pages.dev/','\n',char(10)),'Admin','2025-12-08 02:25:37','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(22,'2025-1205 Daily',replace('* ITB管理web\n* 管理webは一切できない\n* 実施できないテストケースをNTにする\n\nNoteに「管理Webが来てから実施」と記載する\n\n* 開発定例アジェンダ\n* 20251205_開発定例　12月05日 (金曜日)⋅午後16:00～17:00\n* 橋本さん、篠田さんへ\n* UI持ち込むか？確認させてください！\n* 早川さんへ\n* テスト実施についての方針共有の内容記載をお願いいたします。','\n',char(10)),'Admin','2025-12-08 02:30:31','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(23,'＠＠使い方＠＠',replace('## 別の親の子供になる\nTree-view上で\n* 親を増やしたいノードを選択\n* command+c\n* 親にしたいノードを選択\n* commnad+v','\n',char(10)),'Admin','2025-12-08 02:40:58','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(26,'いろいろ実験','','Admin','2025-12-08 07:18:33','2025-12-09 02:17:57');
INSERT INTO "nodes" VALUES(28,'srg','','Admin','2025-12-08 07:57:54','2025-12-09 02:12:42');
INSERT INTO "nodes" VALUES(33,'1.あまがえる','','Admin','2025-12-09 00:33:41','2025-12-09 02:20:09');
INSERT INTO "nodes" VALUES(34,'4.がまがえる','','Admin','2025-12-09 00:33:54','2025-12-09 02:20:09');
INSERT INTO "nodes" VALUES(35,'2.殿様がえる','','Admin','2025-12-09 00:34:18','2025-12-09 02:20:09');
INSERT INTO "nodes" VALUES(36,'3.食用がえる','','Admin','2025-12-09 00:34:32','2025-12-09 02:20:09');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',4);
INSERT INTO "sqlite_sequence" VALUES('node_relations',85);
INSERT INTO "sqlite_sequence" VALUES('nodes',36);
CREATE INDEX idx_node_relations_parent ON node_relations(parent_node_id);
CREATE INDEX idx_node_relations_child ON node_relations(child_node_id);
CREATE INDEX idx_node_relations_parent_position 
ON node_relations(parent_node_id, position);
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
