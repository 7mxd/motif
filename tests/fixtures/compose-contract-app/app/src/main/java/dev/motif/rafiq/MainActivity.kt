package dev.motif.rafiq

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.motif.rafiq.data.Session
import dev.motif.rafiq.ui.add.AddHabitScreen
import dev.motif.rafiq.ui.habit.HabitScreen
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifVariant
import dev.motif.rafiq.ui.signin.SignInScreen
import dev.motif.rafiq.ui.today.TodayScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RafiqApp()
        }
    }
}

/** The app's places. A habit's page takes the habit's id. */
object Routes {
    const val TODAY = "today"
    const val HABIT = "habit/{id}"
    const val ADD = "add"
    const val SIGN_IN = "sign-in"

    fun habit(id: String) = "habit/$id"
}

@Composable
fun RafiqApp(navController: NavHostController = rememberNavController()) {
    val context = LocalContext.current
    val session = remember { Session(context.applicationContext) }
    // The High contrast variant is the person's choice, remembered on the phone.
    var highContrast by rememberSaveable { mutableStateOf(session.highContrast) }
    MotifTheme(variant = if (highContrast) MotifVariant.Contrast else MotifVariant.Default) {
        NavHost(navController = navController, startDestination = Routes.TODAY) {
            composable(Routes.TODAY) {
                if (!session.signedIn) {
                    // Everything needs someone signed in.
                    LaunchedEffect(Unit) {
                        navController.navigate(Routes.SIGN_IN) { popUpTo(Routes.TODAY) { inclusive = true } }
                    }
                } else {
                    TodayScreen(
                        highContrast = highContrast,
                        onHighContrastChange = {
                            highContrast = it
                            session.highContrast = it
                        },
                        onOpenHabit = { id -> navController.navigate(Routes.habit(id)) },
                        onAddHabit = { navController.navigate(Routes.ADD) },
                        onSignOut = {
                            session.signOut()
                            navController.navigate(Routes.SIGN_IN) { popUpTo(Routes.TODAY) { inclusive = true } }
                        },
                    )
                }
            }
            composable(Routes.HABIT, arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                HabitScreen(id = entry.arguments?.getString("id").orEmpty(), onBack = { navController.popBackStack() })
            }
            composable(Routes.ADD) {
                AddHabitScreen(onBack = { navController.popBackStack() }, onSaved = { navController.popBackStack() })
            }
            composable(Routes.SIGN_IN) {
                SignInScreen(
                    session = session,
                    onSignedIn = {
                        navController.navigate(Routes.TODAY) { popUpTo(Routes.SIGN_IN) { inclusive = true } }
                    },
                )
            }
        }
    }
}
