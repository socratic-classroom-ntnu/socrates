# 人像開發測試
- 模型由同源 `/avatar-packs/` 唯讀供應並依產品篩選；目前 checked-in stage 未供 catalog／GLB，會顯示 fallback。
- CE 只接受明列 `ce` 的模型；Socratic 教師與學生共用許可篩選，清單確認不可用的舊值須重選後才能保存；清單載入中或失敗可保留原值，後端允許的開課不受影響。「重新載入人像」會重抓 catalog 與模型。
- 啟用 `debug_mode` 後展開「人像選擇（開發）」並點「重播既有錄音對話」；使用既有錄音，不呼叫 LLM、TTS、STT 或 SpeechSynthesis。
- 錄音為 `en-US-GuyNeural`、90 筆 visemes、31 筆 word timings；四份資產在解碼前驗 SHA256，音訊時鐘驅動嘴型。
- 點擊時同步解鎖音訊；停止、關閉語音或換模型會取消播放，晚到的解鎖不得重新啟動音訊。
- 個人教室與共思競技場使用新導師訊息；掛載前舊訊息不重播，新訊息等目前模型 ready 才發話。
- 共思舞台使用目前 focus 的導師訊息；正式文字發話仍可走無語音的嘴型 fallback，錄音重播則使用真實音訊。
- 瀏覽器聲音清單最多等待一秒；嘴型 boundary 按 UTF-16 索引處理 emoji。錄音期間訊息延後到停止後接續，取消會清等待，舊播放不影響新發話。
- 驗證請執行 frontend typecheck、test、lint、build，並在對話室／Arena 實點重載、檢查音訊、嘴型與取消；播放結束不等於人類驗收。
