import SwiftUI

@main
struct TradingJournalApp: App {
    var body: some Scene {
        WindowGroup {
            JournalWebView()
                .preferredColorScheme(.dark)
                .ignoresSafeArea()
        }
    }
}
