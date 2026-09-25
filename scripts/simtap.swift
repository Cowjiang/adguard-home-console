// Simulator touch-injection helper for manual verification (tracked in scripts/):
// usage: swift scripts/simtap.swift tap <x> <y>
//       swift scripts/simtap.swift scroll <x> <y> <dy>   dy = scroll distance
//         (logical points; negative swipes up → content scrolls up)
//       swift scripts/simtap.swift drag <x> <y> <dx>     dx = horizontal drag
//         distance (logical points; positive drags right)
//       swift scripts/simtap.swift dragcancel <x> <y> <dx>  lift after pausing
//         halfway (past half) to verify gesture-cancel rebound
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
  // Calibration values (re-measured 2026-09-22 PM, Device Hub 1100x800 window
  // at default zoom): simulator screen origin offset within the window + scale
  return ((b["X"] ?? 0) + 522, (b["Y"] ?? 0) + 82)
}
let CAL_SCALE: CGFloat = 0.732

let args = CommandLine.arguments
guard args.count >= 4, args[1] == "tap" || args[1] == "scroll" || args[1] == "drag" || args[1] == "dragcancel",
      let px = Double(args[2]), let py = Double(args[3]),
      let b = deviceHubWindowBounds() else {
  FileHandle.standardError.write("usage: simtap tap <x> <y> | scroll <x> <y> <dy> | drag <x> <y> <dx> | dragcancel <x> <y> <dx>\n".data(using: .utf8)!)
  exit(1)
}
let (ox, oy) = contentOrigin(b)
// Screen logical points → window pixels: ratio of window content width to
// device logical width (device logical width 402; iPhone 18 Pro is the same
// generation as the 16 Pro)
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
} else if args[1] == "drag" || args[1] == "dragcancel" {
  guard let dx = Double(args[4]) else {
    FileHandle.standardError.write(Data(((args[1] == "drag" ? "drag" : "dragcancel") + " needs dx\n").utf8))
    exit(1)
  }
  let steps = 20
  let dpt = CGFloat(dx) * scale / CGFloat(steps)
  post(.leftMouseDown, at: CGPoint(x: gx, y: gy))
  usleep(50_000)
  let last = args[1] == "dragcancel" ? steps / 2 : steps
  for i in 1...last {
    post(.leftMouseDragged, at: CGPoint(x: gx + dpt * CGFloat(i), y: gy))
    usleep(16_000)
  }
  if args[1] == "dragcancel" {
    usleep(400_000)
  } else {
    usleep(80_000)
  }
  post(.leftMouseUp, at: CGPoint(x: gx + dpt * CGFloat(last), y: gy))
  print("\(args[1]) at \(px),\(py) by \(dx)pt → global (\(Int(gx)),\(Int(gy)))")
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
