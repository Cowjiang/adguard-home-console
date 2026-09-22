// 模拟器触摸注入小工具(验证用,不入库):
// 用法: swift scripts/simtap.swift tap <x> <y>
//       swift scripts/simtap.swift scroll <x> <y> <dy>   dy 为滚动距离(逻辑点,向上滑为负→内容上滚)
import CoreGraphics
import Foundation

func deviceHubWindowBounds() -> [String: CGFloat]? {
  let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
  guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { return nil }
  for w in list {
    if let owner = w[kCGWindowOwnerName as String] as? String, owner.contains("Device Hub"),
       let name = w[kCGWindowName as String] as? String, name.contains("iPhone"),
       let bounds = w[kCGWindowBounds as String] as? [String: CGFloat], bounds["Width"] ?? 0 > 300 {
      return bounds
    }
  }
  return nil
}

func contentOrigin(_ b: [String: CGFloat]) -> (CGFloat, CGFloat) {
  // 标定值(2026-09-22,以 Device Hub 中四 tab 图标实测):模拟器屏幕原点在窗口内的偏移 + 缩放
  return ((b["X"] ?? 0) + 520, (b["Y"] ?? 0) + 74)
}
let CAL_SCALE: CGFloat = 0.762

let args = CommandLine.arguments
guard args.count >= 4, args[1] == "tap" || args[1] == "scroll",
      let px = Double(args[2]), let py = Double(args[3]),
      let b = deviceHubWindowBounds() else {
  FileHandle.standardError.write("usage: simtap tap <x> <y> | scroll <x> <y> <dy>\n".data(using: .utf8)!)
  exit(1)
}
let (ox, oy) = contentOrigin(b)
// 屏幕逻辑点 → 窗口像素:取窗口内容宽/设备逻辑宽的比例(设备逻辑宽 402,iPhone 18 Pro 同 16 Pro 代)
let scale = CAL_SCALE
let gx = ox + CGFloat(px) * scale
let gy = oy + CGFloat(py) * scale

func post(_ t: CGEventType, at p: CGPoint) {
  let e = CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)!
  e.post(tap: .cghidEventTap)
}

if args[1] == "tap" {
  post(.leftMouseDown, at: CGPoint(x: gx, y: gy))
  usleep(60_000)
  post(.leftMouseUp, at: CGPoint(x: gx, y: gy))
  print("tapped \(px),\(py) → global (\(Int(gx)),\(Int(gy))) scale=\(scale)")
} else {
  guard let dy = Double(args[4]) else {
    FileHandle.standardError.write("scroll needs dy\n".data(using: .utf8)!)
    exit(1)
  }
  let steps = 12
  let dpt = CGFloat(dy) * scale / CGFloat(steps)
  post(.leftMouseDown, at: CGPoint(x: gx, y: gy))
  usleep(50_000)
  for i in 1...steps {
    post(.leftMouseDragged, at: CGPoint(x: gx, y: gy + dpt * CGFloat(i)))
    usleep(16_000)
  }
  usleep(80_000)
  post(.leftMouseUp, at: CGPoint(x: gx, y: gy + dpt * CGFloat(steps)))
  print("scrolled at \(px),\(py) by \(dy)pt → global (\(Int(gx)),\(Int(gy)))")
}
