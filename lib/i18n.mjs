const EXACT = new Map([
  ['Quota exhausted', 'Hạn mức đã cạn'],
  ['Forecast unavailable', 'Không có dự báo'],
  ['Collect more snapshots', 'Thu thập thêm ảnh chụp'],
  ['Possible shortfall — limited evidence', 'Có thể thiếu hạn mức — bằng chứng hạn chế'],
  ['Slow down to reach the reset', 'Giảm nhịp để dùng đến lúc đặt lại'],
  ['Protect the remaining buffer', 'Bảo vệ phần đệm còn lại'],
  ['Pace looks sustainable; evidence is limited', 'Nhịp có vẻ bền vững; bằng chứng còn hạn chế'],
  ['Room for more useful work', 'Còn dư cho tác vụ hữu ích'],
  ['On track, but pace varies', 'Đang đúng hướng, nhưng nhịp dao động'],
  ['Usage is on track', 'Mức sử dụng đang đúng hướng'],
  ['Included usage is blocked by the service', 'Quyền dùng gói đi kèm bị dịch vụ chặn'],
  ['No quota windows available', 'Không có cửa sổ hạn mức'],
  ['Headroom detected; access status unavailable', 'Phát hiện phần dư; chưa biết trạng thái truy cập'],
  ['Wait for the service to report available quota.', 'Chờ dịch vụ báo hạn mức khả dụng.'],
  ['A current usage value and a future reset time are required.', 'Cần có mức sử dụng hiện tại và thời điểm đặt lại trong tương lai.'],
  ['Budget is available, but recent pace is not yet known.', 'Đã có ngân sách, nhưng chưa biết nhịp gần đây.'],
  ['Check near the start and end of work sessions to improve the recent forecast.', 'Kiểm tra gần đầu và cuối phiên làm việc để cải thiện dự báo gần đây.'],
  ['Even the higher observed pace leaves a buffer. Use the headroom for valuable tasks and re-check after heavier work.', 'Ngay cả nhịp quan sát cao hơn vẫn còn phần đệm. Dùng phần dư cho tác vụ hữu ích và kiểm tra lại sau tác vụ nặng hơn.'],
  ['A busier stretch could use the buffer. Keep near the suggested budget.', 'Một giai đoạn bận hơn có thể tiêu vào phần đệm. Hãy giữ gần ngân sách đề xuất.'],
  ['Current pace is within the suggested budget.', 'Nhịp hiện tại nằm trong ngân sách đề xuất.'],
  ['Available percentages do not override the backend restriction.', 'Các tỷ lệ còn lại không bỏ qua hạn chế do backend báo cáo.'],
  ['The backend did not return an active window.', 'Backend không trả về cửa sổ đang hoạt động.'],
  ['The backend did not confirm ordinary usage permission.', 'Backend chưa xác nhận quyền sử dụng thông thường.'],
  ['Spend control reached', 'Đã chạm kiểm soát chi tiêu'],
  ['Unavailable', 'Không khả dụng'],
  ['Method not found', 'Không tìm thấy phương thức'],
  ['Synthetic quota unavailable', 'Không thể lấy hạn mức tổng hợp'],
  ['Cached forecast — refresh before acting', 'Dự báo đã lưu — cập nhật trước khi hành động'],
  ['The projections below were evaluated when this snapshot was captured.', 'Các dự báo dưới đây được tính tại thời điểm ảnh chụp được lưu.'],
  ['Not checked by the backend. Confirm manually in Codex; 10% is an advisory threshold.', 'Backend chưa kiểm tra. Hãy xác nhận thủ công trong Codex; 10% là ngưỡng tư vấn.'],
  ['Refresh quota before considering a reset', 'Cập nhật hạn mức trước khi cân nhắc đặt lại'],
  ['Cached or stale data cannot establish current need or credit validity.', 'Dữ liệu đã lưu hoặc lỗi thời không thể xác định nhu cầu hiện tại hay hiệu lực của lượt đặt lại.'],
  ['Reset-credit data unavailable', 'Không có dữ liệu lượt đặt lại'],
  ['The service did not expose reset inventory.', 'Dịch vụ không cung cấp danh sách lượt đặt lại.'],
  ['Reset inventory needs a fresh check', 'Danh sách lượt đặt lại cần được kiểm tra mới'],
  ['No use recommendation is made from inconsistent details.', 'Không đưa ra khuyến nghị sử dụng vì các chi tiết không nhất quán.'],
  ['No banked resets available', 'Không có lượt đặt lại đã tích lũy'],
  ['There is no available reset to plan.', 'Không có lượt đặt lại khả dụng để lập kế hoạch.'],
  ['Available reset count is unknown', 'Chưa rõ số lượt đặt lại khả dụng'],
  ['Expiry information alone cannot confirm an available reset.', 'Chỉ thông tin hết hạn không thể xác nhận có lượt đặt lại khả dụng.'],
  ['Core quota is not available in this view', 'Không có hạn mức chính trong chế độ xem này'],
  ['Reset effects on other model buckets are not assumed. Use cq resets for the core-quota assessment.', 'Không giả định tác động của việc đặt lại lên các nhóm model khác. Dùng cq resets để đánh giá hạn mức chính.'],
  ['Account identity is unavailable', 'Không có định danh tài khoản'],
  ['Refresh before making an account-specific reset decision.', 'Cập nhật trước khi quyết định đặt lại cho tài khoản này.'],
  ['Current core-window data is incomplete', 'Dữ liệu cửa sổ hạn mức chính hiện chưa đầy đủ'],
  ['A known 5-hour or weekly window with current usage and a future reset is needed.', 'Cần có cửa sổ 5 giờ hoặc hàng tuần, kèm mức sử dụng hiện tại và thời điểm đặt lại trong tương lai.'],
  ['A reset is not a remedy for the reported restriction', 'Đặt lại không giải quyết được hạn chế đã báo cáo'],
  ['The service reports a workspace, credit or spend-control restriction. Check that restriction in Codex.', 'Dịch vụ báo cáo hạn chế workspace, credit hoặc kiểm soát chi tiêu. Hãy kiểm tra hạn chế đó trong Codex.'],
  ['Usage permission needs confirmation', 'Cần xác nhận quyền sử dụng'],
  ['A reset cannot be assumed to resolve an unspecified account restriction.', 'Không thể giả định việc đặt lại sẽ giải quyết hạn chế tài khoản chưa rõ.'],
  ['Consider a manual reset before the credit expires', 'Cân nhắc đặt lại thủ công trước khi lượt này hết hạn'],
  ['Core quota is at or below 10% and a credit expires within 72 hours. If you still need useful work, check eligibility in Codex and consider the earliest-expiring compatible credit.', 'Hạn mức chính còn tối đa 10% và một lượt đặt lại sẽ hết hạn trong 72 giờ. Nếu vẫn cần làm việc hữu ích, hãy kiểm tra điều kiện trong Codex và cân nhắc lượt tương thích sắp hết hạn nhất.'],
  ['The natural reset is close', 'Lần đặt lại tự nhiên sắp đến'],
  ['The low window(s) refresh within 6 hours and the expiring credit survives that refresh. Waiting may avoid an unnecessary reset; re-check afterward.', 'Cửa sổ thấp sẽ làm mới trong 6 giờ và lượt sắp hết hạn vẫn còn sau lần làm mới đó. Chờ có thể tránh một lần đặt lại không cần thiết; hãy kiểm tra lại sau đó.'],
  ['Plan sequential reset checks before expiry', 'Lập kế hoạch kiểm tra đặt lại tuần tự trước khi hết hạn'],
  ['There is a conditional low-quota opportunity before expiry. Later credits are evaluated after earlier hypothetical refills, not against the same first crossing. Some credits may still expire unused; re-run after each reset.', 'Có một cơ hội hạn mức thấp có điều kiện trước khi hết hạn. Các lượt sau được đánh giá sau những lần nạp giả định trước đó, không dựa trên cùng một mốc đầu tiên. Một số lượt vẫn có thể hết hạn khi chưa dùng; chạy lại sau mỗi lần đặt lại.'],
  ['Some reset credit may expire unused', 'Một số lượt đặt lại có thể hết hạn khi chưa dùng'],
  ['At the observed pace, there may be little need for the credit before expiry. Schedule useful work if needed and re-check; do not reset a healthy quota just to spend a credit.', 'Với nhịp đã quan sát, có thể không cần lượt này trước khi hết hạn. Lập lịch tác vụ hữu ích nếu cần và kiểm tra lại; đừng đặt lại hạn mức đang ổn chỉ để dùng lượt.'],
  ['Plan a reset check before expiry', 'Lập kế hoạch kiểm tra đặt lại trước khi hết hạn'],
  ['Average quota pace reaches the advisory 10% threshold before a credit expires and before the natural reset. Re-check then; eligibility is not confirmed.', 'Nhịp hạn mức trung bình chạm ngưỡng tư vấn 10% trước khi lượt hết hạn và trước lần đặt lại tự nhiên. Hãy kiểm tra lại lúc đó; điều kiện chưa được xác nhận.'],
  ['A busier day could change reset timing', 'Một ngày bận hơn có thể thay đổi thời điểm đặt lại'],
  ['Today or the higher observed pace could reach low quota before expiry. This is a sensitivity scenario, not a reason to reset now.', 'Nhịp hôm nay hoặc nhịp cao hơn đã quan sát có thể đưa hạn mức xuống thấp trước khi hết hạn. Đây là kịch bản độ nhạy, không phải lý do để đặt lại ngay.'],
  ['Reassess after the natural reset', 'Đánh giá lại sau lần đặt lại tự nhiên'],
  ['The natural window refreshes before expiry and no low-quota crossing was projected before that refresh. The next cycle cannot be predicted reliably from this one.', 'Cửa sổ tự nhiên làm mới trước khi hết hạn và không dự báo chạm hạn mức thấp trước lần làm mới đó. Không thể dự báo đáng tin cậy chu kỳ tiếp theo từ chu kỳ này.'],
  ['More quota history is needed for reset timing', 'Cần thêm lịch sử hạn mức để xác định thời điểm đặt lại'],
  ['An expiry date is known, but sparse or fallback pace cannot establish how much work remains before it.', 'Đã biết ngày hết hạn, nhưng nhịp thưa hoặc nhịp dự phòng không thể xác định còn làm được bao nhiêu trước thời điểm đó.'],
  ['Keep the reset available for needed work', 'Giữ lượt đặt lại cho tác vụ cần thiết'],
  ['Quota is low, but no exposed compatible credit is near expiry. Consider a manual reset only if needed to continue useful work.', 'Hạn mức thấp, nhưng không có lượt tương thích đã cung cấp nào sắp hết hạn. Chỉ cân nhắc đặt lại thủ công nếu cần tiếp tục tác vụ hữu ích.'],
  ['Exposed reset details have expired', 'Chi tiết lượt đặt lại đã cung cấp đều hết hạn'],
  ['The available count may include unexposed credits. Refresh to obtain valid details.', 'Số lượng khả dụng có thể gồm các lượt chưa được cung cấp chi tiết. Hãy cập nhật để lấy thông tin hợp lệ.'],
  ['No near-term reset timing can be established', 'Không thể xác định thời điểm đặt lại trong ngắn hạn'],
  ['Expiry details may be missing, outside the seven-day horizon, or for an unknown reset type.', 'Chi tiết hết hạn có thể bị thiếu, nằm ngoài phạm vi bảy ngày hoặc thuộc loại đặt lại chưa rõ.'],
  ['Reset credit', 'Lượt đặt lại'],
  ['Reset', 'Đặt lại'],
  ['Unknown', 'Chưa rõ'],
  ['Unknown model', 'Model chưa rõ'],
  ['unknown model', 'model chưa rõ'],
  ['unknown effort', 'mức suy luận chưa rõ'],
  ['default speed', 'tốc độ mặc định'],
  ['Not exposed', 'Không được cung cấp'],
  ['Expiry not exposed', 'Không có thời điểm hết hạn'],
  ['Not available', 'Không khả dụng'],
  ['Not returned by this account', 'Tài khoản này không trả về thông tin'],
  ['Not exposed by the backend', 'Backend không cung cấp'],
  ['Permission not exposed', 'Quyền chưa được cung cấp'],
  ['Allowed by service', 'Được dịch vụ cho phép'],
  ['Blocked by service', 'Bị dịch vụ chặn'],
  ['No task estimate returned by the backend', 'Backend không trả về ước tính cho tác vụ này'],
  ['No quota windows returned', 'Không có cửa sổ hạn mức'],
  ['Quota windows', 'Cửa sổ hạn mức'],
  ['Quota', 'Hạn mức'],
  ['Weekly', 'Hàng tuần'],
  ['No buffer-preserving target remains', 'Không còn mục tiêu bảo toàn phần đệm'],
  ['No buffer-preserving budget remains', 'Không còn ngân sách bảo toàn phần đệm'],
  ['No within-day comparison yet', 'Chưa có so sánh trong ngày'],
  ['No buckets returned in this range', 'Không có mục dữ liệu trong khoảng này'],
  ['No snapshots in this range. Run cq to collect one.', 'Không có ảnh chụp trong khoảng này. Chạy cq để thu thập một ảnh.'],
  ['Optional RPC unavailable', 'RPC tùy chọn không khả dụng'],
  ['Blocked by transport allowlist', 'Bị chặn bởi danh sách cho phép của lớp truyền tải'],
  ['Codex returned no rate-limit snapshot.', 'Codex không trả về ảnh chụp hạn mức.'],
  ['Connection closed.', 'Kết nối đã đóng.'],
  ['Oversized app-server response.', 'Phản hồi từ app-server quá lớn.'],
  ['JSON-RPC error', 'Lỗi JSON-RPC'],
  ['Action needed', 'Cần xử lý'],
  ['Slow down', 'Giảm tốc độ'],
  ['Protect your buffer', 'Bảo vệ phần đệm'],
  ['You are on track', 'Bạn đang đúng hướng'],
  ['Refresh before planning', 'Cập nhật trước khi lập kế hoạch'],
  ['More data needed', 'Cần thêm dữ liệu'],
  ['No quota forecast is available.', 'Không có dự báo hạn mức.'],
  ['Based on', 'Dựa trên'],
  ['Without reset', 'Không đặt lại'],
  ['History', 'Lịch sử'],
  ['Quota RPC', 'RPC hạn mức'],
  ['Activity RPC', 'RPC hoạt động'],
  ['Account writes', 'Ghi tài khoản'],
  ['Risk basis', 'Cơ sở rủi ro'],
  ['without manual reset', 'không đặt lại thủ công'],
  ['without reset', 'không đặt lại'],
  ['Budget', 'Ngân sách'],
  ['Pace vs budget', 'Nhịp so với ngân sách'],
  ['Evidence', 'Bằng chứng'],
  ['ADVICE', 'KHUYẾN NGHỊ'],
  ['DO NOW', 'VIỆC CẦN LÀM'],
  ['RESET COACH · advice only', 'TƯ VẤN ĐẶT LẠI · chỉ khuyến nghị'],
  ['RESET TIMELINE · conditional scenario', 'DÒNG THỜI GIAN ĐẶT LẠI · kịch bản có điều kiện'],
  ['BANKED RESETS · reported inventory', 'LƯỢT ĐẶT LẠI ĐÃ TÍCH LŨY · tồn kho được báo cáo'],
  ['ACCOUNT ACTIVITY · tokens', 'HOẠT ĐỘNG TÀI KHOẢN · token'],
  ['TASK ACTIVITY · backend estimates', 'HOẠT ĐỘNG TÁC VỤ · ước tính từ backend'],
  ['DIAGNOSTICS', 'CHẨN ĐOÁN'],
  ['NOTES', 'GHI CHÚ'],
  ['Current', 'Hiện tại'],
  ['Safe target', 'Mục tiêu an toàn'],
  ['Trend', 'Xu hướng'],
  ['Resets', 'Đặt lại'],
  ['Availability', 'Khả dụng'],
  ['Restriction', 'Hạn chế'],
  ['Access', 'Quyền truy cập'],
  ['Manual resets', 'Đặt lại thủ công'],
  ['Next expiry', 'Hết hạn tiếp theo'],
  ['Scenario check', 'Kiểm tra theo kịch bản'],
  ['Re-check', 'Kiểm tra lại'],
  ['Day coverage', 'Độ phủ trong ngày'],
  ['Average pace', 'Nhịp trung bình'],
  ['Pace source', 'Nguồn nhịp'],
  ['Today pace', 'Nhịp hôm nay'],
  ['Natural reset', 'Đặt lại tự nhiên'],
  ['10% at average', 'Chạm 10% ở nhịp trung bình'],
  ['Data gaps', 'Khoảng trống dữ liệu'],
  ['Depends on', 'Phụ thuộc vào'],
  ['Reassess by', 'Đánh giá lại trước'],
  ['Expiry pressure', 'Áp lực hết hạn'],
  ['Available', 'Số lượng khả dụng'],
  ['Expiry details', 'Chi tiết hết hạn'],
  ['Details', 'Chi tiết'],
  ['Lifetime', 'Tổng tích lũy'],
  ['Peak day', 'Ngày cao nhất'],
  ['Streak', 'Chuỗi ngày'],
  ['Longest turn', 'Lượt chạy dài nhất'],
  ['Date range', 'Khoảng ngày'],
  ['Reported total', 'Tổng được báo cáo'],
  ['Latest bucket', 'Mục mới nhất'],
  ['Daily tokens', 'Token theo ngày'],
  ['Task detail', 'Chi tiết tác vụ'],
  ['Model', 'Model'],
  ['Recent pace', 'Nhịp gần đây'],
  ['Left at reset', 'Còn lại khi đặt lại'],
  ['May run out', 'Có thể cạn'],
  ['Pace range', 'Khoảng nhịp'],
  ['Reset range', 'Khoảng còn lại khi đặt lại'],
  ['No-buffer cap', 'Giới hạn không phần đệm'],
  ['Extra headroom', 'Phần dư bổ sung'],
  ['No-reset advice', 'Khuyến nghị không đặt lại'],
  ['Workspace credit', 'Credit workspace'],
  ['Spend allowance', 'Hạn mức chi tiêu'],
  ['Included usage', 'Quyền dùng gói đi kèm'],
  ['Banked resets', 'Lượt đặt lại đã tích lũy'],
  ['Latest activity', 'Hoạt động gần nhất'],
  ['Strategy', 'Chiến lược'],
  ['STRATEGY', 'CHIẾN LƯỢC'],
  ['Current pace may finish below your buffer. Aim for the suggested budget.', 'Nhịp hiện tại có thể khiến phần còn lại thấp hơn phần đệm. Hãy hướng tới ngân sách đề xuất.'],
  ['Refresh with cq before deciding how much quota to use.', 'Cập nhật bằng cq trước khi quyết định mức sử dụng hạn mức.'],
  ['Pause quota-heavy work and refresh after the reported reset.', 'Tạm dừng tác vụ tốn nhiều hạn mức và cập nhật sau thời điểm đặt lại được báo cáo.'],
  ['Keep your current pace. Re-check after heavier work.', 'Giữ nhịp hiện tại. Kiểm tra lại sau tác vụ nặng hơn.'],
  ['Check again at the end of your work session to improve the advice.', 'Kiểm tra lại vào cuối phiên làm việc để có khuyến nghị tốt hơn.'],
  ['If work cannot wait, check manual-reset eligibility in Codex now.', 'Nếu không thể chờ, hãy kiểm tra điều kiện đặt lại thủ công trong Codex ngay.'],
  ['Run cq online to refresh quota and advice.', 'Chạy cq trực tuyến để cập nhật hạn mức và khuyến nghị.'],
  ['For needed work, check manual-reset eligibility in Codex now.', 'Với tác vụ cần thiết, hãy kiểm tra điều kiện đặt lại thủ công trong Codex ngay.'],
  ['A banked reset does not lower current risk until used. Re-run cq afterward.', 'Lượt đặt lại đã tích lũy không làm giảm rủi ro hiện tại cho đến khi được dùng. Chạy lại cq sau đó.'],
  ['Re-check at the end of your work session; use the budget as a provisional guide.', 'Kiểm tra lại vào cuối phiên làm việc; xem ngân sách như hướng dẫn tạm thời.'],
  ['Refresh quota before continuing.', 'Cập nhật hạn mức trước khi tiếp tục.'],
  ['Keep usage near', 'Giữ mức sử dụng khoảng'],
  ['Keep to the no-reset budget for now; check the reset option', 'Tạm giữ theo ngân sách không đặt lại; kiểm tra tuỳ chọn đặt lại'],
  ['If needed, check manual-reset eligibility around', 'Nếu cần, hãy kiểm tra điều kiện đặt lại thủ công khoảng'],
  ['Refresh before acting', 'Cập nhật trước khi hành động'],
  ['in saved snapshot', 'trong ảnh chụp đã lưu'],
  ['available', 'khả dụng'],
  ['next expires in', 'lượt tiếp theo hết hạn sau'],
  ['conditional, not a reservation', 'có điều kiện, không phải lịch đặt trước'],
  ['Now, before expiry', 'Bây giờ, trước khi hết hạn'],
  ['since local midnight', 'từ nửa đêm địa phương'],
  ['beyond natural reset; not a usable forecast', 'sau lần đặt lại tự nhiên; không phải dự báo có thể dùng'],
  ['reset/correction/missing-window boundary(s) excluded', 'điểm giao giữa đặt lại/điều chỉnh/cửa sổ thiếu bị loại'],
  ['Low-confidence illustration only; not a timing recommendation.', 'Chỉ là minh hoạ với độ tin cậy thấp; không phải khuyến nghị thời điểm.'],
  ['Today counts observed quota only; missing time is unknown. Tokens are not used.', 'Hôm nay chỉ tính hạn mức đã quan sát; thời gian thiếu chưa rõ. Không sử dụng token.'],
  ['Credit', 'Lượt đặt lại'],
  ['expires', 'hết hạn'],
  ['check', 'kiểm tra'],
  ['manual use of credit(s)', 'việc dùng thủ công lượt đặt lại'],
  ['refresh after each', 'cập nhật sau mỗi lần'],
  ['Slower pace', 'Nhịp chậm hơn'],
  ['Faster / today', 'Nhanh hơn / hôm nay'],
  ['Expiry unknown', 'Không rõ hạn'],
  ['Some expiry/history details are limited. See cq resets for evidence.', 'Một số chi tiết hết hạn/lịch sử bị giới hạn. Xem cq resets để biết bằng chứng.'],
  ['Multiple credits may expire unused · cq resets for the scenario', 'Nhiều lượt có thể hết hạn khi chưa dùng · xem kịch bản bằng cq resets'],
  ['Unlimited', 'Không giới hạn'],
  ['Balance not exposed', 'Số dư không được cung cấp'],
  ['Credit/USD estimates are preserved in --json; no charge is inferred.', 'Ước tính credit/USD được giữ trong --json; không suy ra khoản phí.'],
  ['Backend dates; timezone unspecified. Tokens do not convert to quota %.', 'Ngày do backend cung cấp; múi giờ chưa được xác định. Token không quy đổi thành % hạn mức.'],
  ['Pace range is a sensitivity estimate, not a statistical confidence interval. Integer quota readings have limited precision.', 'Khoảng nhịp là ước tính độ nhạy, không phải khoảng tin cậy thống kê. Số đọc hạn mức nguyên có độ chính xác giới hạn.'],
  ['Fallback assumes a full window before the reported reset. It cannot establish recent pace.', 'Nhịp dự phòng giả định một cửa sổ đầy đủ trước lần đặt lại được báo cáo. Không thể xác định nhịp gần đây.'],
  ['The following quota projections assume no manual reset.', 'Các dự báo hạn mức sau đây giả định không đặt lại thủ công.'],
  ['Ranges show pace sensitivity, not guaranteed outcomes. Re-check after heavy work.', 'Các khoảng cho thấy độ nhạy của nhịp, không bảo đảm kết quả. Kiểm tra lại sau tác vụ nặng.'],
  ['pp = percentage points of that quota; budgets do not carry over after reset.', 'pp = điểm phần trăm của hạn mức đó; ngân sách không chuyển sang chu kỳ sau khi đặt lại.'],
  ['No live account check.', 'Không kiểm tra tài khoản trực tiếp.'],
  ['Snapshots', 'ảnh chụp'],
  ['Local history', 'Lịch sử cục bộ'],
  ['Live', 'Trực tiếp'],
  ['CACHED', 'ĐÃ LƯU'],
  ['account unknown', 'tài khoản chưa rõ'],
  ['tokens', 'token'],
  ['total', 'tổng'],
  ['input', 'đầu vào'],
  ['output', 'đầu ra'],
  ['Cached input', 'Input đã lưu đệm'],
  ['New input', 'Input mới'],
  ['Observed pace leaves the planned quota buffer.', 'Nhịp đã quan sát vẫn giữ được phần đệm hạn mức đã lập kế hoạch.'],
  ['Separate reported quota; consider only for tasks this model is suitable for. Quota does not establish model capability.', 'Hạn mức được báo cáo riêng; chỉ cân nhắc cho tác vụ phù hợp với model này. Hạn mức không xác lập khả năng của model.'],
  ['Quota is exhausted. Current access needs attention.', 'Hạn mức đã cạn. Quyền truy cập hiện tại cần được xử lý.'],
  ['Not enough reliable evidence to rate the current pace.', 'Chưa đủ bằng chứng đáng tin cậy để đánh giá nhịp hiện tại.'],
  ['Current pace may exhaust quota before the natural reset.', 'Nhịp hiện tại có thể làm cạn hạn mức trước lần đặt lại tự nhiên.'],
  ['Quota may last, but the safety buffer is at risk.', 'Hạn mức có thể đủ dùng, nhưng phần đệm an toàn đang gặp rủi ro.'],
  ['Refresh live quota before deciding what to do.', 'Cập nhật hạn mức trực tiếp trước khi quyết định.'],
  ['Check a manual reset for needed work', 'Kiểm tra đặt lại thủ công nếu cần làm việc'],
  ['Plan useful work around a reset check', 'Lập kế hoạch tác vụ hữu ích quanh lần kiểm tra đặt lại'],
  ['Without a manual reset, the current pace needs conservation. An exposed credit offers a conditional alternative: check quota and eligibility before its deadline, then refresh this plan after any reset. This does not guarantee continued access or justify extra work.', 'Nếu không đặt lại thủ công, cần tiết chế theo nhịp hiện tại. Một lượt được cung cấp tạo ra phương án thay thế có điều kiện: kiểm tra hạn mức và điều kiện trước hạn, sau đó cập nhật kế hoạch này sau mỗi lần đặt lại. Điều này không bảo đảm quyền truy cập tiếp tục và không biện minh cho tác vụ thêm.'],
  ['Choose --json or --raw.', 'Chọn --json hoặc --raw.'],
  ['--compact is for text overview/status.', '--compact chỉ dùng cho overview/status dạng văn bản.'],
  ['--raw requires a live quota/activity command.', '--raw cần command hạn mức/hoạt động trực tiếp.'],
  ['doctor requires live connectivity; omit --offline.', 'doctor cần kết nối trực tiếp; bỏ --offline.'],
  ['--thread is only supported by live usage.', '--thread chỉ được hỗ trợ với usage trực tiếp.'],
  ['--days is for usage/history.', '--days chỉ dùng cho usage/history.'],
  ['--reserve is for overview/forecast.', '--reserve chỉ dùng cho overview/forecast.'],
  ['--limit is for overview/status/forecast/history.', '--limit chỉ dùng cho overview/status/forecast/history.'],
  ['No cached snapshot available. Run cq online first.', 'Không có ảnh chụp đã lưu. Chạy cq trực tuyến trước.'],
  ['No params supported', 'Không hỗ trợ tham số'],
  ['Conditional scenario: each manual reset refills all modeled core windows to 100%, at the advisory 10% threshold. Dates assume the reported natural reset remains unchanged. Confirm eligibility and credit selection manually; re-run cq after every reset. Planning stops at the first natural refresh or seven days. Later steps depend on earlier resets actually happening.', 'Kịch bản có điều kiện: mỗi lần đặt lại thủ công nạp lại toàn bộ cửa sổ hạn mức chính được mô phỏng lên 100% tại ngưỡng tư vấn 10%. Ngày giờ giả định lần đặt lại tự nhiên được báo cáo không thay đổi. Hãy xác nhận điều kiện và lượt được chọn thủ công; chạy lại cq sau mỗi lần đặt lại. Kế hoạch dừng ở lần làm mới tự nhiên đầu tiên hoặc sau bảy ngày. Các bước sau phụ thuộc vào việc các lần đặt lại trước đó thực sự xảy ra.'],
  ['Faster-pace sequential scenario, not a guaranteed waste count. Full refill to 100%, 10% trigger; one credit per shared opportunity. Only deadlines before the first natural refresh are assessed.', 'Kịch bản tuần tự theo nhịp nhanh hơn, không phải số lượt lãng phí được bảo đảm. Nạp đầy lên 100%, kích hoạt ở 10%; mỗi cơ hội chung dùng một lượt. Chỉ đánh giá các hạn trước lần làm mới tự nhiên đầu tiên.'],
  ['Several credits may expire unused in the modeled scenario. Do not create unnecessary work merely to spend them.', 'Một số lượt có thể hết hạn khi chưa dùng trong kịch bản mô phỏng. Đừng tạo tác vụ không cần thiết chỉ để dùng chúng.'],
  ['Some credit IDs are missing; aggregate excess-credit estimates are disabled.', 'Một số ID lượt đặt lại bị thiếu; đã tắt ước tính tổng số lượt dư.'],
  ['Credit details conflict with each other or the available count. Refresh before deciding.', 'Chi tiết lượt đặt lại mâu thuẫn với nhau hoặc với số lượng khả dụng. Hãy cập nhật trước khi quyết định.'],
  ['Some available detail rows are already expired; those rows are excluded from planning.', 'Một số dòng chi tiết khả dụng đã hết hạn; các dòng đó bị loại khỏi kế hoạch.'],
  ['Observed within-day deltas only; unobserved time and reset-crossing intervals are excluded. Not a full-day total.', 'Chỉ tính chênh lệch hạn mức trong ngày; loại thời gian chưa quan sát và khoảng đi qua lần đặt lại. Đây không phải tổng của cả ngày.'],
]);

const CONFIDENCE = { low: 'thấp', medium: 'trung bình', high: 'cao', unknown: 'chưa rõ' };
const SOURCES = {
  'recency-weighted quota history': 'lịch sử hạn mức có trọng số theo độ mới',
  'current-window average': 'trung bình của cửa sổ hiện tại',
  'insufficient history': 'lịch sử chưa đủ',
  unavailable: 'không khả dụng',
  history: 'lịch sử',
};
const RISKS = { danger: 'NGUY HIỂM', high: 'RỦI RO CAO', low: 'RỦI RO THẤP', ok: 'ĐÚNG HƯỚNG', unknown: 'CHƯA RÕ' };
const RISK_LABELS = { DANGER: 'NGUY HIỂM', 'HIGH RISK': 'RỦI RO CAO', 'LOW RISK': 'RỦI RO THẤP', 'ON TRACK': 'ĐÚNG HƯỚNG', UNKNOWN: 'CHƯA RÕ', 'CACHED / UNKNOWN': 'ĐÃ LƯU / CHƯA RÕ' };
const RESET_STATUSES = {
  expired: 'đã hết hạn',
  unknown_type: 'loại chưa rõ',
  unknown_expiry: 'hạn chưa rõ',
  beyond_horizon: 'ngoài phạm vi dự báo',
  deadline_passed: 'đã quá thời điểm kiểm tra',
  natural_reset_soon: 'sắp đặt lại tự nhiên',
  consider_manual: 'cân nhắc đặt lại thủ công',
  save_until_needed: 'giữ lại đến khi cần',
  watch_before_expiry: 'theo dõi trước khi hết hạn',
  limited_evidence: 'bằng chứng hạn chế',
  pace_sensitive: 'phụ thuộc vào nhịp sử dụng',
  natural_reset_first: 'đặt lại tự nhiên trước',
  expiry_risk: 'có nguy cơ hết hạn',
  conditional_check: 'kiểm tra có điều kiện',
  not_needed_before_expiry: 'chưa cần trước khi hết hạn',
  reassess_after_natural: 'đánh giá lại sau đặt lại tự nhiên',
};
const RESTRICTIONS = {
  rate_limit_reached: 'Đã chạm hạn mức',
  workspace_owner_credits_depleted: 'Credit của chủ workspace đã cạn',
  workspace_member_usage_limit_reached: 'Đã chạm giới hạn sử dụng của thành viên workspace',
};

export const LABELS = Object.freeze({
  title: 'CODEX QUOTA COACH',
  live: 'Trực tiếp',
  cached: 'ĐÃ LƯU',
  localHistory: 'Lịch sử cục bộ',
  quota: 'HẠN MỨC',
  pace: 'NHỊP SỬ DỤNG',
  advice: 'KHUYẾN NGHỊ',
  strategy: 'CHIẾN LƯỢC',
  diagnostics: 'CHẨN ĐOÁN',
  notes: 'GHI CHÚ',
});

export const translateConfidence = value => CONFIDENCE[value] || translateText(value);
export const translateSource = value => SOURCES[value] || translateText(value);
export const translateRiskLabel = value => RISKS[value] || RISK_LABELS[value] || translateText(value);
export const translateResetStatus = value => RESET_STATUSES[value] || translateText(value?.replaceAll('_', ' '));
export const translateRestriction = value => RESTRICTIONS[value] || translateText(value);

export function translateWindow(label, durationMins) {
  if (durationMins === 10080 || label === 'Weekly') return 'Hàng tuần';
  if (Number.isFinite(durationMins) && durationMins > 0) {
    if (durationMins % 1440 === 0) return `${durationMins / 1440} ngày`;
    if (durationMins % 60 === 0) return `${durationMins / 60} giờ`;
    return `${durationMins} phút`;
  }
  return translateText(label);
}

export function translateText(value) {
  const text = String(value ?? '');
  if (EXACT.has(text)) return EXACT.get(text);
  let translated = text;
  translated = translated.replace(/^At this pace, quota may run out before reset\. Reduce burn about (\d+)% to retain the (\d+)% buffer\.$/, 'Với nhịp này, hạn mức có thể cạn trước khi đặt lại. Giảm mức tiêu thụ khoảng $1% để giữ lại phần đệm $2%.');
  translated = translated.replace(/^Current pace may finish below your (\d+)% buffer\. Aim for the suggested budget\.$/, 'Nhịp hiện tại có thể khiến phần còn lại thấp hơn phần đệm $1% của bạn. Hãy hướng tới ngân sách đề xuất.');
  translated = translated.replace(/^(\d+) credit\(s\) have no detail rows; their expiry is unknown\.$/, '$1 lượt đặt lại không có dòng chi tiết; chưa rõ thời điểm hết hạn.');
  translated = translated.replace(/^OK · (\d+) bucket\(s\)$/, 'Đạt · $1 nhóm hạn mức');
  translated = translated.replace(/^OK · (\d+) reported daily buckets$/, 'Đạt · $1 mục theo ngày được báo cáo');
  translated = translated.replace(/^(\d+) valid snapshots · (.*)$/, '$1 ảnh chụp hợp lệ · $2');
  translated = translated.replace(/^The natural window refreshes before expiry and no low-quota crossing was projected before that refresh\./, 'Cửa sổ tự nhiên làm mới trước khi hết hạn và không dự báo chạm hạn mức thấp trước lần làm mới đó.');
  return translated;
}

export function translateRecommendation(recommendation) {
  if (!recommendation) return recommendation;
  return { ...recommendation, title: translateText(recommendation.title), detail: translateText(recommendation.detail) };
}

export function translateWarning(value) {
  const text = String(value ?? '');
  let match = text.match(/^(\d+) invalid daily buckets excluded\.$/);
  if (match) return `Đã loại ${match[1]} mục theo ngày không hợp lệ.`;
  match = text.match(/^Cannot read local history: (.*)$/);
  if (match) return `Không thể đọc lịch sử cục bộ: ${translateError(match[1])}`;
  match = text.match(/^Skipped (\d+) malformed history row\(s\); original data was preserved\.$/);
  if (match) return `Đã bỏ qua ${match[1]} dòng lịch sử lỗi; dữ liệu gốc được giữ nguyên.`;
  match = text.match(/^No estimated usage returned for this task; availability depends on its billing route\.$/);
  if (match) return 'Không có ước tính sử dụng cho tác vụ này; khả năng cung cấp phụ thuộc vào tuyến tính phí.';
  match = text.match(/^Account activity unavailable: (.*)$/);
  if (match) return `Hoạt động tài khoản không khả dụng: ${translateError(match[1])}`;
  match = text.match(/^Account activity comes from (.*)\.$/);
  if (match) return `Hoạt động tài khoản lấy từ ${match[1]}.`;
  match = text.match(/^Quota loaded, but snapshot could not be saved: (.*)$/);
  if (match) return `Đã tải hạn mức nhưng không lưu được ảnh chụp: ${translateText(match[1])}`;
  if (text === 'Cached account and quota state may have changed. Forecast describes the saved snapshot, not current access.') return 'Trạng thái tài khoản và hạn mức đã lưu có thể đã thay đổi. Dự báo mô tả ảnh chụp đã lưu, không phải quyền truy cập hiện tại.';
  if (text === 'Account identity was not exposed. Historical comparisons are disabled to avoid mixing accounts.') return 'Không có định danh tài khoản. Đã tắt so sánh lịch sử để tránh trộn tài khoản.';
  return translateText(text);
}

export function translateError(value) {
  const text = String(value ?? '');
  let match = text.match(/^(.+) requires a value\.$/);
  if (match && match[1].startsWith('--')) return `${match[1]} cần một giá trị.`;
  match = text.match(/^Invalid value for (.+)\.$/);
  if (match) return `Giá trị không hợp lệ cho ${match[1]}.`;
  match = text.match(/^(.+) must be an integer from (\d+) to (\d+)\.$/);
  if (match) return `${match[1]} phải là số nguyên từ ${match[2]} đến ${match[3]}.`;
  match = text.match(/^Unknown option: (.+)\. See cq --help\.$/);
  if (match) return `Tùy chọn không được nhận diện: ${match[1]}. Xem cq --help.`;
  match = text.match(/^Unknown command: (.+)\. See cq --help\.$/);
  if (match) return `Lệnh không được nhận diện: ${match[1]}. Xem cq --help.`;
  match = text.match(/^Unexpected argument: (.+)\.$/);
  if (match) return `Đối số không hợp lệ: ${match[1]}.`;
  match = text.match(/^Quota bucket '(.+)' not returned\. Available: (.*)$/);
  if (match) return `Không có nhóm hạn mức '${match[1]}'. Có sẵn: ${match[2]}`;
  match = text.match(/^Codex CLI unavailable: (.*)$/);
  if (match) return `Codex CLI không khả dụng: ${translateText(match[1])}`;
  match = text.match(/^Timed out waiting for (.*)$/);
  if (match) return `Hết thời gian chờ ${match[1]}`;
  match = text.match(/^Read-only policy: blocked (.*)$/);
  if (match) return `Chính sách chỉ đọc: đã chặn ${match[1]}`;
  match = text.match(/^Read-only policy: account\/read requires refreshToken: false$/);
  if (match) return 'Chính sách chỉ đọc: account/read yêu cầu refreshToken: false';
  match = text.match(/^Codex app-server exited \((.*)\)\. ?(.*)$/);
  if (match) return `Codex app-server đã thoát (${match[1]}). ${translateText(match[2])}`.trim();
  return translateText(text);
}

export function ascii(value) {
  return String(value ?? '')
    .replaceAll('·', ' | ')
    .replaceAll('→', '->')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('…', '...')
    .replaceAll('≤', '<=')
    .replaceAll('≥', '>=')
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('‘', "'")
    .replaceAll('’', "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .replace(/[^\x00-\x7F]/g, '?');
}
